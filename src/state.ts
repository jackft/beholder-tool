/*----------------------------------------------------------------------------*/
/* Media                                                                      */
/*----------------------------------------------------------------------------*/

export interface State {
    media: MediaState
    timeline: TimelineState
}

export interface MediaState {
    src: string
    type: "video" | "image" | "audio"
    framerate: number | null
}

export interface TimelineState {
    channels: Array<ChannelState>
    startTime: number
    endTime: number
    timelineAnnotations: Array<TimelineAnnotationState>
}

export interface ChannelState {
    id: number
    parentId: number | null
    name: string
    showBackground?: boolean
    background?: string
}

export interface AnnotationModifierState {
    id: number
    key: string
    value: string
}

export interface TimelineAnnotationState {
    id: number
    channelId: number
    groupId: number | null | undefined
    prevAnnotationId: number | null | undefined
    nextAnnotationId: number | null | undefined
    type: string
    value: string
    startFrame: number
    endFrame: number
    startTime: number
    endTime: number
    modifiers: Array<AnnotationModifierState>
}
