import { Formio } from 'formiojs';
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
            //<div>
            //  <div class="btn-group" role="group" aria-label="Basic example">
            //    <button type="button" class="btn btn-secondary">Timeline</button>
            //    <button type="button" class="btn btn-secondary">Video</button>
            //    <button type="button" class="btn btn-secondary">Entities</button>
            //  </div>
            //</div>
            this.rootElem.setAttribute("class", "beholder-annotation-table");
            const buttonGroup = document.createElement("div");
            buttonGroup.setAttribute("class", "btn-group");
            buttonGroup.setAttribute("role", "group");
            buttonGroup.setAttribute("aria-label", "Basic example");
            this.rootElem.appendChild(buttonGroup);

            const timelineButton = document.createElement("button");
            timelineButton.setAttribute("class", "btn btn-secondary");
            timelineButton.innerText = "Timeline";
            buttonGroup.appendChild(timelineButton);

            const video = document.createElement("button");
            video.setAttribute("class", "btn btn-secondary");
            video.innerText = "Video";
            buttonGroup.appendChild(video);

            const entities = document.createElement("button");
            entities.setAttribute("class", "btn btn-secondary");
            entities.innerText = "Entities";
            buttonGroup.appendChild(entities);


            const rows = document.createElement("div");
            this.rootElem.appendChild(rows);

            const formio = document.createElement("div");
            formio.setAttribute("id", "formio");
            rows.appendChild(formio);

            const x = Formio.createForm(formio,
                {
                    components: [
                        {
                          type: 'textfield',
                          key: 'firstName',
                          label: 'First Name',
                          placeholder: 'Enter your first name.',
                          input: true,
                          tooltip: 'Enter your <strong>First Name</strong>',
                          description: 'Enter your <strong>First Name</strong>',
                          defaultValue: 'jack'
                        },
                        {
                          "type": "textfield",
                          "label": "howdy",
                          "description": "Must be exact, and case sensitive.",
                          "key": "howdy",
                          "input": true,
                          "inputType": "text",
                          "conditional": {
                            "json": {
                              "===": [
                                {
                                  "var": "data.firstName"
                                },
                                "jack"
                              ]
                            }
                          }
                        }
                    ]
                }
            );
            console.log(x);
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
