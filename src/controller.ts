import { State } from '@pixi/core';
import { ChannelState, TimelineAnnotationState } from './state';
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

export class Controller {
    public element: HTMLDivElement;
    public timeline: timeline.Timeline;
    public table: table.Table;
    public media: media.Media;
    private historyHandler: HistoryHandler;

    constructor(element: HTMLDivElement, s: any) {
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

        this.timeline = new timeline.Timeline(timelineContainer, s);
        this.media = new media.Video(topContainer, s.media);
        this.table = new table.TabulatorTable(topContainer);
        this.historyHandler = new HistoryHandler();

        this._bindEvents();
    }

    _bindEvents() {
        this.timeline.addEventListener("selectTimelineAnnotation", (state: TimelineAnnotationState) => this.selectTimelineAnnotation(state));
        this.timeline.addEventListener("deselectTimelineAnnotation", (state: TimelineAnnotationState) => this.deselectTimelineAnnotation(state));
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
            };
            const redo = () => {
                if (this.timeline !== null) {
                    this.timeline.createTimelineAnnotation(newState);
                }
            }
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            this.timeline.createTimelineAnnotation(newState);
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
            };
            const redo = () => {
                this.timeline.deleteTimelineAnnotation(newState);
            };
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            this.timeline.deleteTimelineAnnotation(newState);
        }
    }

    selectTimelineAnnotation(state: TimelineAnnotationState) {
        if (this.timeline.selectedTimelineAnnotation !== null && this.timeline.selectedTimelineAnnotation.state.id !== state.id) {
            this.timeline.deselectTimelineAnnotation(this.timeline.selectedTimelineAnnotation.state);
        }
        this.timeline.selectTimelineAnnotation(state);
        this.table.selectTimelineAnnotation(state);
    }
    deselectTimelineAnnotation(state: TimelineAnnotationState) {

    }

    playpause() {}

    stepForward() {}
    stepBackward() {}

    undo() {console.log(this.historyHandler.undoStack); this.historyHandler.undo()}
    redo() {this.historyHandler.redo()}
}
