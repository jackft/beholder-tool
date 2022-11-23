export interface ChannelState {
    id: number,
    parentId: number | null,
    name: string,
    allowedAnnotationIds: Array<number> | null,
    waveforms?: {[key: number]: {uri: string, data: Object | null, points: number[] | null}},
    showWaveform?: boolean
    spectrogram?: string
    showSpectrogram?: boolean
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