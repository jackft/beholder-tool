// createChannel => create, idx, position
// uncreateChannel => create, idx, position
//
// deleteChannel => messy and recursive...dn't want to think about it
// undeleteChannel => 
//
// resizeChannel => resize, idx, st-1 => st
// unResizeChannel => resize, idx, st => st-1
//
// createAnnotatoin => create, idx, type, params
// uncreateAnnotatoin => create, idx, type, params
//
// createAnnotatoin => create, idx, type, params
// uncreateAnnotatoin => create, idx, type, params
//



import { Media, Video } from './media';
import { Timeline } from './timeline';
import { Table } from './table';
import { Config, Layout, State, ChannelState, TimelineState, MediaState, TimelineAnnotationState } from './state';

function undoCreateChannel(timeline: Timeline, channelId: number) {
    const c = timeline.getChannel(channelId);
    if (c === null) {
        console.error("channel w/id == %d not found", channelId);
        return;
    }
    c.delete();
}

function redoCreateChannel(timeline: Timeline, channelId: number) {
}

function undoResizeChannel(timeline: Timeline, channelId: number, height: number) {
    const c = timeline.getChannel(channelId);
    if (c === null) {
        console.error("channel w/id == %d not found", channelId);
        return;
    }
    c.height = height;
}

function redoResizeChannel(timeline: Timeline, channelId: number, height: number) {
    const c = timeline.getChannel(channelId);
    if (c === null) {
        console.error("channel w/id == %d not found", channelId);
        return;
    }
    c.height = height;
}

function undoDeleteChannel() {
    // create channel
    // set channel state
    // for all undo callbacks
}

function redoDeleteChannel(timeline: Timeline, channelId: number) {
    const c = timeline.getChannel(channelId);
    if (c === null) {
        console.error("channel w/id == %d not found", channelId);
        return;
    }
    c.delete();
}

class StateTransition {
    doCallback: () => void;
    undoCallback:() => void;

    constructor(doCallback, undoCallback) {
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
}

function deepCopy(o) {return JSON.parse(JSON.stringify(o))}

export class Controller {
    state: State;
    layout: Layout;
    historyHandler: HistoryHandler = new HistoryHandler();

    rootElem: HTMLElement
    mediaContainer: HTMLElement | null
    media: Media
    timeline?: Timeline;
    table?: Table;
    constructor(rootElem: HTMLElement, config: Config) {
        this.rootElem = rootElem;
        this.state = config.state;
        this.layout = config.layout;
        this.media = this.initMedia(this.state.media);
        this.mediaContainer = this.media.element.parentElement;
        if (this.state.timeline != null) {
            this.timeline = this.initTimeline(this.state.timeline);
        }
        if (this.layout.table !== null) {
            this.table = this.initTable(this.state);
        }
        this.setGridLayout();
        this.listeners();
    }

    initTable(state: State) {
        const element = document.createElement("div");
        const table = new Table(element, state.timeline, this.layout);
        this.rootElem.append(element);
        return table;
    }

    initMedia(mediaState: MediaState) {
        const element = document.createElement("div");
        element.setAttribute("class", "beholder-media");
        this.rootElem.append(element);
        return new Video(element, mediaState);
    }

    initTimeline(timelineState: TimelineState) {
        const element = document.createElement("div");
        element.setAttribute("class", "beholder-timeline beholder-background");
        this.rootElem.append(element);
        const timeline = new Timeline(element, timelineState, this.layout);
        return timeline;
    }

    setGridLayout() {
        this.rootElem.style.setProperty("display", "grid");
        this.rootElem.style.setProperty("grid-template-columns", this.layout.cssGridCols);
        this.rootElem.style.setProperty("grid-template-rows", this.layout.cssGridRows);

        if (this.layout.timelineLayout !== undefined && this.timeline != undefined) {
            this.timeline.rootElem.style.setProperty(
                "grid-row",
                `${this.layout.timelineLayout[0]} / ${this.layout.timelineLayout[2]}`
            );
            this.timeline.rootElem.style.setProperty(
                "grid-column",
                `${this.layout.timelineLayout[1]} / ${this.layout.timelineLayout[3]}`
            );
            this.timeline.rootElem.style.setProperty("width", `${this.layout.maxTimelineInitWidth}px`);
        }

        if (this.layout.mediaLayout !== undefined) {
            this.media.rootElem.style.setProperty(
                "grid-row",
                `${this.layout.mediaLayout[0]} / ${this.layout.mediaLayout[2]}`
            );
            this.media.rootElem.style.setProperty(
                "grid-column",
                `${this.layout.mediaLayout[1]} / ${this.layout.mediaLayout[3]}`
            );
        }

        if (this.table !== undefined && this.layout.tableLayout !== undefined) {
            this.table.rootElem.style.setProperty(
                "grid-row",
                `${this.layout.tableLayout[0]} / ${this.layout.tableLayout[2]}`
            );
            this.table.rootElem.style.setProperty(
                "grid-column",
                `${this.layout.tableLayout[1]} / ${this.layout.tableLayout[3]}`
            );
        }

        if (this.mediaContainer != null) {
            this.mediaContainer.style.setProperty("width", `${this.layout.maxMediaInitWidth}px`);
        }

        if (this.mediaContainer != null && this.timeline != null) {
            this.media.addEventListener(
                "media.resize",
                (entry) => {
                    if (this.timeline !== undefined) {
                        this.timeline.rootElem.style.setProperty("width", `${entry.contentRect.width}px`)
                        this.timeline.resizeFullWidth();
                        this.timeline.draw();
                    }
                }
            );
        }

        console.log(this.layout);
    }

    /*------------------------------------------------------------------------*/
    /* Listeners                                                              */
    /*------------------------------------------------------------------------*/
    listeners() {
        if (this.timeline !== undefined) {
            this.timeline.addEventListener("timeline.createChannel", (state) => {
                this.createChannel(state)
            });
        }
    }

    /*------------------------------------------------------------------------*/
    /* Commands                                                               */
    /*------------------------------------------------------------------------*/
    createChannel(state: ChannelState) {
        if (this.timeline === undefined) return;
        const newState = deepCopy(state);
        const undo = () => {
            if (this.timeline === undefined) return;
            const channel = this.timeline.deleteChannel(newState.id);
        };
        const redo = () => {
            if (this.timeline === undefined) return;
            const channel = this.timeline.createChannel(newState);
        };
        this.historyHandler.do(new StateTransition(redo, undo));
    }

    updateChannel(state: ChannelState) {
        if (this.timeline === undefined) return;
        const channel = this.timeline.getChannel(state.id);
        if (channel === null) return;
        const oldState = deepCopy(channel.state);
        const newState = deepCopy(state);
        const undo = () => {
            if (this.timeline === undefined) return;
            const channel = this.timeline.updateChannel(oldState);
        };
        const redo = () => {
            if (this.timeline === undefined) return;
            const channel = this.timeline.updateChannel(newState);
        };
        this.historyHandler.do(new StateTransition(redo, undo));
    }

    deleteChannel(state: ChannelState) {
    }

    createTimelineAnnotation(state: TimelineAnnotationState) {
        if (this.timeline === undefined) return;
        const newState = deepCopy(state);
        const undo = () => {
            if (this.timeline === undefined) return;
            this.timeline.deleteTimelineAnnotation(newState.id);
            if (this.table) {
                this.table.deleteTimelineAnnotation(newState);
            }
        };
        const redo = () => {
            if (this.timeline === undefined) return;
            const timelineAnnotatation = this.timeline.createTimelineAnnotation(newState);
            timelineAnnotatation.addEventListener(
                "annotation.dragend", event => this.updateTimelineAnnotation(event.oldState, event.newState),
            );
            timelineAnnotatation.addEventListener(
                "annotation.drag", event => this.updateTimelineAnnotationWithoutTracking(event.oldState, event.newState),
            );
            this.timeline.drawAnnotations();
            if (this.table) {
                this.table.createTimelineAnnotation(newState);
            }
        };
        this.historyHandler.do(new StateTransition(redo, undo));
    }

    updateTimelineAnnotation(oldState: TimelineAnnotationState, newState: TimelineAnnotationState) {
        if (this.timeline === undefined) return;
        const annotation = this.timeline.getTimelineAnnotation(oldState.id);
        if (annotation === null) return;
        const undo = () => {
            if (this.timeline === undefined) return;
            this.timeline.updateTimelineAnnotation(oldState);
            this.table.updateTimelineAnnotation(oldState);
        };
        const redo = () => {
            if (this.timeline === undefined) return;
            this.timeline.updateTimelineAnnotation(newState);
            this.table.updateTimelineAnnotation(newState);
            console.log(this.table?.update());
        };
        this.historyHandler.do(new StateTransition(redo, undo));
    }

    updateTimelineAnnotationWithoutTracking(oldState: TimelineAnnotationState, newState: TimelineAnnotationState) {
        this.table.updateTimelineAnnotationWithoutTracking(newState);
    }

    deleteTimelineAnnotation() {

    }
}
