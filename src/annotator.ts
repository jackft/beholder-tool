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

export class Annotator {
    //
    public annotations: { [key: number]: TimelineAnnotationState } = {}
    public channels: { [key: number]: ChannelState } = {}
    //
    private historyHandler: HistoryHandler;
    public timeline: timeline.Timeline;
    public table: table.Table;
    public media: media.Media;

    //

    //
    public element: HTMLDivElement;

    constructor(element: HTMLDivElement, config: any = {}) {
        // <div>
        //   <div>
        //     <div class="medi"></div>
        //     <div class="table"></div>
        //   </div>
        //   <div>
        //     <div class="timeline"></div>
        //   </div>
        // </div>

        this.element = element;

        const topContainer = document.createElement("div");
        topContainer.style.display = "flex";
        this.element.appendChild(topContainer);
        const bottomContainer = document.createElement("div");
        this.element.appendChild(bottomContainer);

        const timelineContainer = document.createElement("div");
        this.element.appendChild(timelineContainer);

        this.timeline = new timeline.Timeline(this, timelineContainer, config?.timeline || {});
        this.media = new media.Video(topContainer, config);
        this.table = new table.TabulatorTable(this, topContainer);
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
        this.table.addEventListener("updateTimelineAnnotation", (state: TimelineAnnotationState) => this.updateTimelineAnnotation(state, this.timeline.annotations[state.id].state, true));

        this.timeline.addEventListener("deleteChannel", (state: ChannelState) => this.deleteChannel(state));
        this.timeline.addEventListener("createChannel", (state: ChannelState) => this.createChannel(state));

        this.media.addEventListener("media.timeupdate", (event) => this.timeline.timeUpdate(event.timeMs));
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
        states.forEach(state => this.timeline.createTimelineAnnotation(state));
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

    selectTimelineAnnotation(state: TimelineAnnotationState) {
        this.timeline.selectTimelineAnnotation(state);
        this.table.selectTimelineAnnotation(state);
    }
    deselectTimelineAnnotation(state: TimelineAnnotationState) {
        this.timeline.deselectTimelineAnnotation(state);
        this.table.deselectTimelineAnnotation(state);
    }

    playpause() {}

    stepForward() {}
    stepBackward() {}

    undo() {console.log(this.historyHandler.undoStack); this.historyHandler.undo()}
    redo() {this.historyHandler.redo()}

    jsonDump() {
        const data = {
            media: this.media.state,
            timeline: {
                startTime: this.timeline.xscale.domain[0],
                endTime: this.timeline.xscale.domain[1],
                channels: this.timeline.channels.map(channel => channel.state),
                timelineAnnotations: Object.values(this.annotations)
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
}
