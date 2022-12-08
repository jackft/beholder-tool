/*----------------------------------------------------------------------------*/
/* Media                                                                      */
/*----------------------------------------------------------------------------*/

export interface MediaState {
    src: string,
    type: "video" | "image" | "audio"
    framerate: number | null
}

export interface ChannelState {
    id: number,
    parentId: number | null,
    name: string,
    allowedAnnotationIds: Array<number> | null,
    showBackground?: boolean,
    background?: string
}



export interface AnnotationModifierState {
    id: number,
    label: string,
    value: string
}

export interface TimelineAnnotationState {
    id: number,
    channelId: number,
    type: string,
    value: string,
    startFrame: number,
    endFrame: number,
    startTime: number,
    endTime: number,
    modifiers: Array<AnnotationModifierState>
}

export const timelineAnnotationStateKeys = [
    "id",
    "channelId",
    "type",
    "value",
    "startFrame",
    "endFrame",
    "startTime",
    "endTime",
    "modifiers"
];
