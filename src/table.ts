import { Layout, State, TimelineAnnotationState } from './state';
import { inJestTest } from './utils';

interface TableEvents {
    "table.resize": Array<(event: ResizeObserverEntry) => void>,
}

export class Table {
    rootElem: HTMLElement
    state: State
    events: TableEvents
    layout: Layout
    constructor(rootElem: HTMLElement, state: State, layout: Layout) {
        this.rootElem = rootElem;
        this.state = state;
        this.layout = layout;

        this.events = {
            "table.resize": [],
        };

        this.subscribeToEvents();

        this.initTable();
        this.update();
    }

    addEventListener(name, handler) {
        this.events[name].push(handler);
    }

    removeEventListener(name, handler) {
        if (!this.events.hasOwnProperty(name)) return;
        const index = this.events[name].indexOf(handler);
        if (index != -1)
            this.events[name].splice(index, 1);
    }

    subscribeToEvents() {
        if (inJestTest()) return;
        const mediaResizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                this.events["table.resize"].forEach(f => f(entry));
            });
        });
        mediaResizeObserver.observe(this.rootElem);
    }

    initTable() {
        if (this.layout.table) {
            this.rootElem.setAttribute("class", "beholder-annotation-table");
            this.rootElem.innerHTML = `
            <div class="btn-group" role="group" aria-label="Basic example">
              <button type="button" class="btn btn-secondary">Left</button>
              <button type="button" class="btn btn-secondary">Middle</button>
              <button type="button" class="btn btn-secondary">Right</button>
            </div>`;
        }
    }

    update() {
        console.log(this.state);
    }

    //getTimelineAnnotation(annotationId: number): TimelineAnnotation | null {
        //const annotationIdx = this.timelineAnnotations.map(a=>a.state.id).indexOf(annotationId);
        //if (annotationIdx == -1) return null;
        //return this.timelineAnnotations[annotationIdx];
    //}

    updateTimelineAnnotation(state: TimelineAnnotationState) {
        //const timelineAnnotation = this.getTimelineAnnotation(state.id);
        //const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(state.id);
        //if (timelineAnnotation === null || timelineAnnotationStateIdx == -1) return null;
        //timelineAnnotation.state = state;
        //this.state.timelineAnnotations[timelineAnnotationStateIdx] = state;
        //timelineAnnotation.draw();
        //this.drawAnnotations();
    }

}
