/*----------------------------------------------------------------------------*/
/* Media                                                                      */
/*----------------------------------------------------------------------------*/

export interface MediaState {
    src: string,
    type: "video" | "image" | "audio"
}

/*----------------------------------------------------------------------------*/
/* Timeline                                                                   */
/*----------------------------------------------------------------------------*/

export interface ChannelState {
    id: number,
    parentId: number | null,
    name: string,
    allowedAnnotationIds: Array<number> | null
}

export interface TimelineState {
    channels: Array<ChannelState>
    timelineAnnotations: Array<TimelineAnnotationState>
}

/*----------------------------------------------------------------------------*/
/* Annotations                                                                */
/*----------------------------------------------------------------------------*/

export interface AnnotationModifierState {
    id: number,
    label: string,
    value: string
}

export interface TimelineAnnotationState {
    id: number,
    channelId: number,
    type: string,
    label: string,
    startFrame: number,
    endFrame: number,
    startTime: number,
    endTime: number,
    modifiers: Array<AnnotationModifierState>
}

export interface ChannelAnnotationState {
    id: number,
    channelId: number,
    label: string,
    modifiers: Array<AnnotationModifierState>
}

/*----------------------------------------------------------------------------*/

export interface State {
    media: MediaState,
    timeline: TimelineState | null,
}

export interface Layout {
    cssGridRows: string,
    cssGridCols: string,
    timelineLayout?: [number, number, number, number],
    tableLayout?: [number, number, number, number],
    mediaLayout?: [number, number, number, number],
    channelHeight?: number,
    treeWidth?: number,

    maxMediaInitWidth: number,
    maxTimelineInitWidth: number
}

export interface Config {
    state: State,
    layout: Layout
}
