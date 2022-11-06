// createChannel => create, idx, position
// uncreateChannel => create, idx, position
//
// deleteChannel => messy and recursive...dn't want to think about it
// undeleteChannel => 
//
// resizeChannel => resize, idx, st-1 => st
// unResizeChannel => resize, idx, st => st-1
//
// createAnnotation => create, idx, type, params
// uncreateAnnotation => create, idx, type, params
//
// createAnnotation => create, idx, type, params
// uncreateAnnotation => create, idx, type, params
//



import { Media, Video } from './media';
import { Channel, Timeline, TimelineMode } from './timeline';
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

function normalizeEvent(event: MouseEvent): [number, number] {
    return [event.clientX, event.clientY];
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

    silentDo(t: StateTransition) {
        this.redoStack = [];
        this.undoStack.push(t);
        return this;
    }

}

function deepCopy(o) {return JSON.parse(JSON.stringify(o))}

export class Controller {
    state: State
    layout: Layout
    readonly: boolean = false
    schema: Object | null = null
    historyHandler: HistoryHandler = new HistoryHandler()

    rootElem: HTMLElement
    mediaContainer: HTMLElement | null
    media: Media
    timeline?: Timeline
    table?: Table

    // statefulness
    selectedAnnotationId: number | null
    constructor(rootElem: HTMLElement, config: Config) {
        this.rootElem = rootElem;
        this.state = config.state;
        this.layout = config.layout;
        if (config.readonly !== undefined) {
            this.readonly = config.readonly;
        }
        if (config.schema !== undefined) {
            this.schema = config.schema;
        }
        this.media = this.initMedia(this.state.media);
        this.mediaContainer = this.media.element.parentElement;
        if (this.state.timeline != null) {
            this.timeline = this.initTimeline(this.state.timeline);
        }
        if (this.layout.table !== null) {
            this.table = this.initTable(this.state);
            const mh = this.media.rootElem.clientHeight;
            const lh = this.timeline.rootElem.clientHeight;
            this.table.rootElem.style.setProperty("max-height", `${mh+lh}px `);
        }
        this.setGridLayout();
        this.listeners();
        this.state.timeline.timelineAnnotations.forEach(state => {
            this.createTimelineAnnotation(state);
        });
    }

    initTable(state: State) {
        const element = document.createElement("div");
        const table = new Table(element, state.timeline, this.layout, this.readonly, this.schema);
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
        const timeline = new Timeline(element, timelineState, this.layout, this.readonly, this.schema);
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
            const resize = (entry) => {
                if (this.timeline !== undefined) {
                    this.timeline.rootElem.style.setProperty("width", `${entry.contentRect.width}px`)
                    this.timeline.resizeFullWidth();
                    this.timeline.channels.forEach(c => c.resizeWaveform());
                    this.timeline.draw({ruler: {draw: true, zoom: false, width: true}});
                }
                if (this.table !== undefined) {
                    this.table.resizeHeight(
                        this.media.height() + this.timeline.rootElem.getBoundingClientRect().height
                    );
                }
            }
            this.media.addEventListener("media.resize", resize);
            this.timeline.addEventListener("timeline.resize", (entry) => {
                if (this.table !== undefined) {
                    this.table.resizeHeight(
                        this.media.height() + this.timeline.rootElem.getBoundingClientRect().height
                    );
                }
            });
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
            this.timeline.addEventListener("timeline.deleteChannel", (state) => {
                this.deleteChannel(state)
            });
            if (this.media !== undefined && this.media instanceof Video) {
                this.timeline.addEventListener("timeline.click", (event) => {
                    const time = this.timeline.event2ms(event);
                    this.media.updateTime(time/1000);
                    this.timeline.timechange({x: time});
                });
                this.timeline.addEventListener("timeline.dragstart", (event) => {
                    if (this.timeline.mode == TimelineMode.Insert) {
                        const time = this.timeline.event2ms(event);
                        const tId = this.timeline.maxAnnotationId() + 1;
                        const channel = this.timeline.event2channel(event);
                        if (channel !== undefined) {
                            this.createTimelineAnnotation({
                                id: tId,
                                channelId: channel.state.id,
                                type: "interval",
                                value: null,
                                startFrame: null,
                                endFrame: null,
                                startTime: time,
                                endTime: time,
                                modifiers: []
                            },
                                false
                            );
                            this.timeline.dragend(event);
                            const timelineAnnotation = this.timeline.getTimelineAnnotation(tId);
                            this.selectTimelineAnnotation(tId);
                            timelineAnnotation.draggedShape = "r";
                            timelineAnnotation.dragstart(event);
                        }
                    }
                });
                this.timeline.addEventListener("timeline.drag", (event) => {
                    switch (event.buttons) {
                        case 1: // left click
                            const time = this.timeline.event2ms(event);
                            this.media.updateTime(time/1000);
                            this.timeline.timechange({x: time});
                            break;
                        case 2: // middle click
                            break;
                        case 3: // right click
                            break;
                        default:
                            break;
                    }
                });
            } else {
                this.timeline.addEventListener("timeline.click", (event) => {
                    const time = this.timeline.event2ms(event);
                    this.timeline.timechange({x: time});
                });
            }
        }

        if (this.table !== undefined) {
            if (this.media !== undefined && this.media instanceof Video) {
                this.table.addEventListener("table.rowSelected", (event) => {
                    this.timeline.timechange({x: event.timeMs});
                    this.media.updateTime(event.timeMs/1000);
                });
            } else {
            }
        }

        if (this.media !== undefined) {
            if (this.timeline !== undefined) {
                this.media.addEventListener("media.timeupdate", (event) => {
                    this.timeline.timechange({x: event.timeMs});
                })
            }
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
        if (this.timeline === undefined) return;
        const newState = deepCopy(state);
        const channels = this.timeline.getChannel(newState.id)
                                      .recursiveChildren(true)
                                      .map(child => child.state);
        const annotations = this.timeline
            .timelineAnnotations
            .filter(annotation => channels.some(channelState => annotation.state.channelId === channelState.id))
            .map(annotation => annotation.state);
        const undo = () => {
            if (this.timeline === undefined) return;
            channels.forEach(channel => this.timeline.createChannel(channel));
            annotations.forEach(annotation => {
                this.timeline.createTimelineAnnotation(annotation);
                this.table.createTimelineAnnotation(annotation);
            });
        };
        const redo = () => {
            if (this.timeline === undefined) return;
            channels.forEach(channel => this.timeline.deleteChannel(channel.id));
            annotations.forEach(annotation => {
                this.timeline.deleteTimelineAnnotation(annotation.id);
                this.table.deleteTimelineAnnotation(annotation.id);
            });
        };
        this.historyHandler.do(new StateTransition(redo, undo));
    }

    createTimelineAnnotation(state: TimelineAnnotationState, tracking=true) {
        if (this.timeline === undefined) return;
        const newState = deepCopy(state);
        const undo = () => {
            if (this.timeline === undefined) return;
            this.deselectTimelineAnnotation(newState.id);
            this.timeline.deleteTimelineAnnotation(newState.id);
            if (this.table) {
                this.table.deleteTimelineAnnotation(newState.id);
            }
        };
        const redo = () => {
            if (this.timeline === undefined) return;
            const timelineAnnotatation = this.timeline.createTimelineAnnotation(newState);
            timelineAnnotatation.addEventListener(
                "annotation.dragend", event => this.updateTimelineAnnotation(event.oldState, event.newState)
            );
            timelineAnnotatation.addEventListener(
                "annotation.drag", event => this.updateTimelineAnnotationWithoutTracking(event.oldState, event.newState)
            );
            timelineAnnotatation.addEventListener(
                "annotation.click", event => this.selectTimelineAnnotation(timelineAnnotatation.state.id)
            );
            this.timeline.drawAnnotations();
            if (this.table) {
                const tableTimelineAnnotation = this.table.createTimelineAnnotation(newState);
                tableTimelineAnnotation.addEventListener(
                    "annotation.click", event => this.selectTimelineAnnotation(timelineAnnotatation.state.id)
                );
                tableTimelineAnnotation.addEventListener(
                    "annotation.datachange", event => {
                        const annotation = this.timeline.getTimelineAnnotation(timelineAnnotatation.state.id);
                        annotation.state.value = event.value;
                        annotation.changeLabel();
                });
            }
        };
        if (tracking) {
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            redo();
        }
    }

    updateTimelineAnnotation(oldState: TimelineAnnotationState, newState: TimelineAnnotationState) {
        if (this.timeline === undefined) return;
        const annotation = this.timeline.getTimelineAnnotation(oldState.id);
        if (annotation === null) return;
        if (annotation.tracking) {
            const undo = () => {
                if (this.timeline === undefined) return;
                this.timeline.updateTimelineAnnotation(oldState);
                this.table.updateTimelineAnnotation(oldState);
            };
            const redo = () => {
                if (this.timeline === undefined) return;
                this.timeline.updateTimelineAnnotation(newState);
                this.table.updateTimelineAnnotation(newState);
            };
            this.historyHandler.do(new StateTransition(redo, undo));
        } else {
            annotation.tracking = true;
            const undo = () => {
                if (this.timeline === undefined) return;
                this.deselectTimelineAnnotation(newState.id);
                this.timeline.deleteTimelineAnnotation(newState.id);
                if (this.table) {
                    this.table.deleteTimelineAnnotation(newState.id);
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
                timelineAnnotatation.addEventListener(
                    "annotation.click", event => this.selectTimelineAnnotation(timelineAnnotatation.state.id)
                );
                this.timeline.drawAnnotations();
                if (this.table) {
                    const tableTimelineAnnotation = this.table.createTimelineAnnotation(newState);
                    tableTimelineAnnotation.addEventListener(
                        "annotation.click", event => this.selectTimelineAnnotation(timelineAnnotatation.state.id)
                    );
                }
            };
            this.historyHandler.silentDo(new StateTransition(redo, undo));
        }
    }

    updateTimelineAnnotationWithoutTracking(oldState: TimelineAnnotationState, newState: TimelineAnnotationState) {
        this.table.updateTimelineAnnotationWithoutTracking(newState);
    }

    deleteSelectedTimelineAnnotation() {
        if (this.selectedAnnotationId === null) return;
        this.deleteTimelineAnnotation(
            this.timeline.getTimelineAnnotation(this.selectedAnnotationId).state
        );
    }

    deleteTimelineAnnotation(state: TimelineAnnotationState) {
        if (this.timeline === undefined) return;
        const newState = deepCopy(state);
        const undo = () => {
            if (this.timeline === undefined) return;
            const timelineAnnotatation = this.timeline.createTimelineAnnotation(newState);
            timelineAnnotatation.addEventListener(
                "annotation.dragend", event => this.updateTimelineAnnotation(event.oldState, event.newState),
            );
            timelineAnnotatation.addEventListener(
                "annotation.drag", event => this.updateTimelineAnnotationWithoutTracking(event.oldState, event.newState),
            );
            timelineAnnotatation.addEventListener(
                "annotation.click", event => this.selectTimelineAnnotation(timelineAnnotatation.state.id)
            );
            this.timeline.drawAnnotations();
            if (this.table) {
                const tableTimelineAnnotation = this.table.createTimelineAnnotation(newState);
                tableTimelineAnnotation.addEventListener(
                    "annotation.click", event => this.selectTimelineAnnotation(timelineAnnotatation.state.id)
                );
                tableTimelineAnnotation.addEventListener(
                    "annotation.datachange", event => {
                        const annotation = this.timeline.getTimelineAnnotation(timelineAnnotatation.state.id);
                        annotation.state.value = event.value;
                        annotation.changeLabel();
                });
            }
        };
        const redo = () => {
            if (this.timeline === undefined) return;
            this.deselectTimelineAnnotation(newState.id);
            this.timeline.deleteTimelineAnnotation(newState.id);
            if (this.table) {
                this.table.deleteTimelineAnnotation(newState.id);
            }
        };
        this.historyHandler.do(new StateTransition(redo, undo));
    }

    selectTimelineAnnotation(timelineAnnotationId: number) {
        if (timelineAnnotationId == this.selectedAnnotationId) return;
        this.selectedAnnotationId = timelineAnnotationId;
        this.timeline.selectTimelineAnnotation(timelineAnnotationId);
        if (this.table) {
            this.table.selectTimelineAnnotation(timelineAnnotationId);
        }
    }

    deselectTimelineAnnotation(timelineAnnotationId: number) {
        if (timelineAnnotationId == this.selectedAnnotationId) {
            this.selectedAnnotationId = null;
            this.timeline.deselectTimelineAnnotation(timelineAnnotationId);
            this.table.deselectTimelineAnnotation(timelineAnnotationId);
        }
    }

    deselect() {
        if (this.selectedAnnotationId === null) return;
        if (this.table) {
            this.table.getTimelineAnnotation(this.selectedAnnotationId).blur();
        }
        this.deselectTimelineAnnotation(this.selectedAnnotationId);
    }

    focus() {
        if (this.selectedAnnotationId === null) return;
        if (this.table) {
            this.table.getTimelineAnnotation(this.selectedAnnotationId).focus();
        }
    }

    setNormalMode() {
        this.timeline.setNormalMode();
    }

    setInsertMode() {
        this.timeline.setInsertMode();
    }

    playpause() {
        this.media.playpause();
    }

    stepForward() {
        this.media.stepForward(1);
    }

    stepBackward() {
        this.media.stepBackward(-1);
    }
}
