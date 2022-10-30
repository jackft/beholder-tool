import { State, TimelineAnnotationState, AnnotationModifierState } from './state';

export interface AnnotationTranscoder {
    export(state: State): string
}

function deepCopy(o) {return JSON.parse(JSON.stringify(o))}

function stripMediaData(state: State) {
    const copy = {};
    copy["media"] = deepCopy(state.media);
    copy["timeline"] = {};
    copy["timeline"]["channels"] = state.timeline.channels.forEach(
        channel => {
            return {
                "id": channel.id,
                "name": channel.name,
                "parentId": channel.parentId,
                "allowedAnnotationIds": deepCopy(channel.allowedAnnotationIds),
            }
    });
    copy["timeline"]["startTime"] = state.timeline.startTime;
    copy["timeline"]["endTime"] = state.timeline.endTime;
    copy["timeline"]["timelineAnnotations"] = deepCopy(state.timeline.timelineAnnotations);
    return copy;
}

export class JSONTranscoder implements AnnotationTranscoder {
    constructor() {

    }

    export(state: State): string {
        return JSON.stringify(stripMediaData(state));
    }
}


export class CSVTranscoder implements AnnotationTranscoder {
    constructor() {

    }

    export(state: State): string {
        const columns = new Set();

        state.timeline.timelineAnnotations.forEach(
            annotation => {
                columns.add(annotation.label);
                annotation.modifiers.forEach(
                    modifier => {
                        columns.add(modifier.label);
                })
            }
        );

        const rows = [];
        return "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    }
}
