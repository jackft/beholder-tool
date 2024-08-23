import { ChannelState, TimelineAnnotationState, State } from './state';
import * as timeline from './timeline';
import * as table from './table';
import * as media from './media';
import { deepCopy } from './utils';

class StateTransition {
    doCallback: () => void;
    undoCallback:() => void;

    constructor(doCallback: () => void, undoCallback: () => void) {
        this.doCallback = doCallback;
        this.undoCallback = undoCallback;
    }
}

class HistoryHandler {
    undoStack: Array<StateTransition> = [];
    redoStack: Array<StateTransition> = [];
    constructor() {}

    undo() {
        if (this.undoStack.length > 0) {
            const transition = this.undoStack.pop();
            if (transition !== undefined) {
                transition.undoCallback();
                this.redoStack.push(transition);
            }
        }
        return this;
    }

    redo() {
        if (this.redoStack.length > 0) {
            const transition = this.redoStack.pop();
            if (transition !== undefined) {
                transition.doCallback();
                this.undoStack.push(transition);
            }
        }
        return this;
    }

    do(t: StateTransition) {
        this.redoStack = [];
        t.doCallback();
        this.undoStack.push(t);
        return this;
    }

    silentDo(t: StateTransition) {
        this.redoStack = [];
        this.undoStack.push(t);
        return this;
    }

}

export class ModifierSchema {
    public key: string;
    public name: string;
    public type: string;
    public options?: Array<string> | null;
    public editorParams?: any | null;

    constructor(modifier) {
        this.key = modifier.key;
        this.name = modifier.name;
        this.type = modifier.type;
        this.options = modifier?.options || null;
        this.editorParams = modifier?.editorParams || null;
    }
}

export class Schema {
    public modifiers: Array<ModifierSchema>
    constructor(schema) {
        this.modifiers = schema.modifiers;
    }
}

export class Annotator {
    //
    public annotations: { [key: number]: TimelineAnnotationState } = {}
    public channels: { [key: number]: ChannelState } = {}
    //
    private historyHandler: HistoryHandler;
    public timeline: timeline.Timeline;
    public table: table.Table;
    public media: media.Media;
    public schema: Schema;


    //
    public panels = {
        "A": document.createElement("div"),
        "B": document.createElement("div"),
        "C": document.createElement("div")
    }
    public layouts: Array<string> = ["layout0", "layout1", "layout2", "layout3"];
    public currentLayout: number = 0;
    public element: HTMLDivElement;

    constructor(element: HTMLDivElement, start: number, end: number, config: any = {}) {
        this.element = element;

        this.panels.A.classList.add("grid-panel");
        this.panels.A.style.gridArea = "A";
        this.panels.A.style.resize = "horizontal";
        this.element.appendChild(this.panels.A);
        this.panels.B.classList.add("grid-panel");
        this.panels.B.style.gridArea = "B";
        this.panels.B.style.overflow = "hidden";
        this.element.appendChild(this.panels.B);
        this.panels.C.classList.add("grid-panel");
        this.panels.C.style.gridArea = "C";
        this.element.appendChild(this.panels.C);

        this.element.classList.add(this.layouts[this.currentLayout]);

        this.schema = new Schema(config?.schema || {});
        this.timeline = new timeline.Timeline(this, this.panels.C, start, end, config?.timeline || {});
        this.media = new media.Video(this.panels.A, config);
        this.table = new table.TabulatorTable(this, this.panels.B);
        this.historyHandler = new HistoryHandler();
        this._bindEvents();
    }

    _bindEvents() {
        this.timeline.addEventListener("selectTimelineAnnotation", (state: TimelineAnnotationState) => this.selectTimelineAnnotation(state));
        this.timeline.addEventListener("deselectTimelineAnnotation", (state: TimelineAnnotationState) => this.deselectTimelineAnnotation(state));
        this.timeline.addEventListener("createTimelineAnnotation", (state: TimelineAnnotationState, track: boolean) => this.createTimelineAnnotation(state, track));
        this.timeline.addEventListener("deleteTimelineAnnotation", (state: TimelineAnnotationState, track: boolean) => this.deleteTimelineAnnotation(state, track));
        this.timeline.addEventListener("updateTimelineAnnotation", (newState: TimelineAnnotationState, oldState: TimelineAnnotationState, tracking: boolean) => this.updateTimelineAnnotation(newState, oldState, tracking));
        this.timeline.addEventListener("updateTime", (timeMs: number) => this.media.updateTime(timeMs));
        this.table.addEventListener("selectTimelineAnnotation", (state: TimelineAnnotationState) => this.selectTimelineAnnotation(state));
        this.table.addEventListener("deselectTimelineAnnotation", (state: TimelineAnnotationState) => this.deselectTimelineAnnotation(state));
        this.table.addEventListener("updateTimelineAnnotation", (state: TimelineAnnotationState) => this.updateTimelineAnnotation(state, this.timeline.annotations[state.id].state, true));

        this.timeline.addEventListener("deleteChannel", (state: ChannelState) => this.deleteChannel(state));
        this.timeline.addEventListener("createChannel", (state: ChannelState) => this.createChannel(state));

        this.media.addEventListener("media.timeupdate", (event) => this.timeline.timeUpdate(event.timeMs));
        this.media.addEventListener("media.resize", (entry) => this.table.resize(entry.contentRect.height - 2));
    }

    createChannel(state: ChannelState, track = false) {
        if (this.timeline === null) return;
        if (track) {
            const newState = deepCopy(state);
            const undo = () => {
                const channel = this.timeline.deleteChannel(state);
            }
            const redo = () => {
                const channel = this.timeline.createChannel(state);
            }
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            this.timeline.createChannel(state);
        }
    }
    updateChannel() {}
    deleteChannel(state: ChannelState) {
        if (this.timeline === null) return;
        const newState = deepCopy(state);
        const channel = this.timeline.findChannelById(state.id);
        const annotations = channel !== undefined ? channel.annotations() : [];
        const undo = () => {
            const channel = this.timeline.createChannel(state);
            annotations.forEach(annotation => {
                this.createTimelineAnnotation(annotation.state, false);
            });
        }
        const redo = () => {
            annotations.forEach(annotation => {
                this.deleteTimelineAnnotation(annotation.state, false);
            });
            const channel = this.timeline.deleteChannel(state);
        }
        this.historyHandler.do(new StateTransition(redo, undo));
    }

    batchCreateTimelineAnnotations(states: Array<TimelineAnnotationState>) {
        states.forEach(state => {
            state.modifiers.forEach(modifier => {
                state[modifier.key] = modifier.value;
            });
            this.timeline.createTimelineAnnotation(state);
        });
        this.table.batchCreateTimelineAnnotation(states);
    }

    createTimelineAnnotation(state: TimelineAnnotationState, track=true) {
        if (this.timeline === null) return;
        const newState = deepCopy(state);
        if (track) {
            const undo = () => {
                this.deselectTimelineAnnotation(newState);
                if (this.timeline !== null) {
                    this.timeline.deleteTimelineAnnotation(newState);
                }
                if (this.table !== null) {
                    this.table.deleteTimelineAnnotation(newState);
                }
            };
            const redo = () => {
                if (this.timeline !== null) {
                    this.timeline.createTimelineAnnotation(newState);
                }
                if (this.table !== null) {
                    this.table.createTimelineAnnotation(newState);
                }
            }
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            this.timeline.createTimelineAnnotation(newState);
            this.table.createTimelineAnnotation(newState);
        }
    }
    updateTimelineAnnotation(newState: TimelineAnnotationState, oldState: TimelineAnnotationState, track=true) {
        if (this.timeline === null) return;
        if (track) {
            const undo = () => {
                this.timeline.updateTimelineAnnotation(oldState);
                this.table.updateTimelineAnnotation(oldState);
            };
            const redo = () => {
                this.timeline.updateTimelineAnnotation(newState);
                this.table.updateTimelineAnnotation(newState);
            };
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            this.timeline.updateTimelineAnnotation(newState);
            this.table.updateTimelineAnnotation(newState);
        }
    }
    deleteTimelineAnnotation(state: TimelineAnnotationState, track=true) {
        if (this.timeline === null) return;
        const newState = deepCopy(state);
        if (track) {
            const undo = () => {
                this.timeline.createTimelineAnnotation(state);
                this.table.createTimelineAnnotation(state);
            };
            const redo = () => {
                this.timeline.deleteTimelineAnnotation(newState);
                this.table.deleteTimelineAnnotation(newState);
            };
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            this.timeline.deleteTimelineAnnotation(newState);
            this.table.deleteTimelineAnnotation(newState);
        }
    }
    deleteSelectedAnnotations() {
        console.log(this.timeline.selectionGroup.annotations)
        this.timeline
            .selectionGroup
            .forEach((annotation) => this.timeline.dispatch("deleteTimelineAnnotation", annotation.state))
    }

    selectTimelineAnnotation(state: TimelineAnnotationState) {
        this.timeline.selectTimelineAnnotation(state);
        this.table.selectTimelineAnnotation(state);
    }
    deselectTimelineAnnotation(state: TimelineAnnotationState) {
        this.timeline.deselectTimelineAnnotation(state);
        this.table.deselectTimelineAnnotation(state);
    }
    deselectAll() {
        this.timeline.selectionGroup.map(x=>x).forEach(annotation => {
            this.timeline.deselectTimelineAnnotation(annotation.state);
            this.table.deselectTimelineAnnotation(annotation.state);
        });
    }
    shiftTimelineAnnotationForward() {
        this.timeline.shiftAnnotationForward();
    }
    shiftTimelineAnnotationBackward() {
        this.timeline.shiftAnnotationBackward();
    }

    playpause() {
        this.media.playpause();
    }

    speedUp(factor) {
        // @ts-ignore
        this.media.speedUp(factor);
    };
    slowDown(factor) {
        // @ts-ignore
        this.media.slowDown(factor);
    };

    stepForward(n=1) {this.media.stepForward(n);}
    stepBackward(n=1) {this.media.stepBackward(n);}

    updateTime(timeMs: number) {
        this.media.updateTime(timeMs);
    }

    undo() {this.historyHandler.undo()}
    redo() {this.historyHandler.redo()}

    json() {
        const data = {
            media: this.media.state,
            timeline: {
                startTime: this.timeline.xscale.range[0],
                endTime: this.timeline.xscale.range[1],
                channels: this.timeline.channels.map(channel => channel.state),
                timelineAnnotations: Object.values(this.timeline.annotations).map(a => a.json())
            },
        };
        return data
    }

    readState(state: State) {
        this.timeline.readState(state.timeline);
        this.media.readState(state.media);
        state.timeline.channels.forEach(channel => this.createChannel(channel));
        this.batchCreateTimelineAnnotations(state.timeline.timelineAnnotations);
    }

    cycleLayout(direction = 1) {
        this.element.classList.remove(this.layouts[this.currentLayout]);
        this.currentLayout = (this.currentLayout + direction) % this.layouts.length;
        if (this.currentLayout < 0) {
            this.currentLayout = this.layouts.length - 1;
        }
        this.element.classList.add(this.layouts[this.currentLayout]);
        const gridTemplateAreas = window.getComputedStyle(this.element)["grid-template-areas"];
        console.log(this.currentLayout);
        Object.entries(this.panels).forEach(value => {
            const [panelKey, panelElem] = value;
            const pattern = new RegExp(`\\b(${panelKey})\\b`);
            console.log(pattern, gridTemplateAreas, pattern.test(gridTemplateAreas))
            // hide all panels that aren't in the current grid-template-areas
            if (pattern.test(gridTemplateAreas)) {
                panelElem.style.display = "";
            } else {
                panelElem.style.display = "none";
            }
        });
    }

}
