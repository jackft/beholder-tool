import { State } from '@pixi/core';
import { ChannelState, TimelineAnnotationState } from './state';
import * as timeline from './timeline';

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

function deepCopy(o: Object) {return JSON.parse(JSON.stringify(o))}

export class Controller {
    public timeline: timeline.Timeline;
    private historyHandler: HistoryHandler;

    constructor(s: any) {
        this.timeline = new timeline.Timeline(s);
        this.historyHandler = new HistoryHandler();
    }

    createChannel(state: ChannelState) {
        if (this.timeline === null) return;
        this.timeline.createChannel(state);
    }
    updateChannel() {}
    deleteChannel() {}

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
            if (this.timeline !== null) {
                this.timeline.createTimelineAnnotation(newState);
            }
        }
    }
    updateTimelineAnnotation() {}
    _updateTimelineAnnotationWithTracking() {}
    _updateTimelineAnnotationWithoutTracking() {}
    deleteTimelineAnnotation() {}

    selectTimelineAnnotation() {}
    deselectTimelineAnnotation(state: TimelineAnnotationState) {}

    playpause() {}

    stepForward() {}
    stepBackward() {}
}
