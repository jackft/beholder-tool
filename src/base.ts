import * as state from "./state";

export interface TimelineAnnotation {
    state: state.TimelineAnnotationState
    creartionDrag: boolean
    selected: boolean
    hovered: boolean
    endHovered: boolean
    startHovered: boolean
    dragged: boolean
    draggedStart: boolean
    draggedEnd: boolean

    update(track: boolean): TimelineAnnotation

    move(timeMs: number): TimelineAnnotation
    moveStart(timeMs: number): TimelineAnnotation
    moveEnd(timeMs: number): TimelineAnnotation
    shift(diffMs: number): TimelineAnnotation
    shiftStart(diffMs: number): TimelineAnnotation
    shiftEnd(diffMs: number): TimelineAnnotation
    shiftAnnotationForward(): TimelineAnnotation
    shiftAnnotationBackward(): TimelineAnnotation
    setChannel(channelId: number): TimelineAnnotation
    delete()
    select(): TimelineAnnotation
    deselect(): TimelineAnnotation
    highlight(): TimelineAnnotation
    dehighlight(): TimelineAnnotation
    //
    draw(): TimelineAnnotation
    rescale(): TimelineAnnotation
    //
    mouseDown(x: number, y: number): TimelineAnnotation
    mouseMove(x: number, y: number): TimelineAnnotation
    disableDrag(): TimelineAnnotation
    enableDrag(): TimelineAnnotation
    enableDragEnd(): TimelineAnnotation
    enableDragStart(): TimelineAnnotation
}
