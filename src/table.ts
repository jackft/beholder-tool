import { Formio } from 'formiojs';
import { Layout, TimelineState, TimelineAnnotationState } from './state';
import { inJestTest } from './utils';

interface TableEvents {
    "table.resize": Array<(event: ResizeObserverEntry) => void>,
}

export class Table {
    rootElem: HTMLElement
    rowsElem: HTMLElement
    channelFilterGroupElem: HTMLElement
    channelFilterElem: HTMLSelectElement
    typeFilterElem: HTMLElement
    state: TimelineState
    events: TableEvents
    layout: Layout

    tabSelected: "timeline" | "media" | "entity"
    channelSelected: number | null
    typeSelected: String | null

    timelineAnnotations: Array<TimelineAnnotation>

    constructor(rootElem: HTMLElement, state: TimelineState, layout: Layout) {
        this.rootElem = rootElem;
        this.state = state;
        this.layout = layout;

        this.timelineAnnotations = [];

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

            // buttons
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
            video.innerText = "Media";
            buttonGroup.appendChild(video);

            const entities = document.createElement("button");
            entities.setAttribute("class", "btn btn-secondary");
            entities.innerText = "Entity";
            buttonGroup.appendChild(entities);

            // channel filter
            this.channelFilterGroupElem = document.createElement("div");
            this.channelFilterGroupElem.setAttribute("class", "input-group");
            const channelFilterGroupPrepend = document.createElement("div");
            channelFilterGroupPrepend.setAttribute("class", "input-group-prepend");
            const channelFilterGroupLabel = document.createElement("label");
            channelFilterGroupLabel.setAttribute("class", "input-group-text");
            channelFilterGroupLabel.setAttribute("for", "channelFilter");
            channelFilterGroupLabel.innerText = "channel";
            channelFilterGroupPrepend.appendChild(channelFilterGroupLabel);
            this.channelFilterGroupElem.appendChild(channelFilterGroupPrepend);

            this.channelFilterElem = document.createElement("select");
            this.channelFilterElem.setAttribute("class", "custom-select");
            this.channelFilterElem.setAttribute("id", "channelFilter")
            const option = document.createElement("option");
            option.setAttribute("value", `-1`);
            option.innerText = "**all**"
            this.channelFilterElem.appendChild(option);
            this.state.channels.forEach(channel => {
                const option = document.createElement("option");
                option.setAttribute("value", `${channel.id}`);
                option.innerText = channel.name
                this.channelFilterElem.appendChild(option);
            });
            this.channelFilterGroupElem.appendChild(this.channelFilterElem);
            this.rootElem.appendChild(this.channelFilterGroupElem);

            // rows
            this.rowsElem = document.createElement("div");
            this.rowsElem.setAttribute("class", "beholder-annotation-table-rows");
            this.rootElem.appendChild(this.rowsElem);
        }
    }

    update() {
        console.log(this.state);
    }

    createTimelineAnnotation(state: TimelineAnnotationState) {
        const ta = new TimelineAnnotation(this, state);
        this.timelineAnnotations.push(ta);
        return ta;
    }

    deleteTimelineAnnotation(timelineAnnotationId) {
        const timelineAnnotationIdx = this.timelineAnnotations.map(a=>a.state.id).indexOf(timelineAnnotationId);
        const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(timelineAnnotationId);
        if (timelineAnnotationIdx == -1 || timelineAnnotationStateIdx == -1) return null;
        this.timelineAnnotations[timelineAnnotationIdx].delete();
        this.timelineAnnotations.splice(timelineAnnotationIdx, 1);
        this.state.timelineAnnotations.splice(timelineAnnotationStateIdx, 1);
    }

    getTimelineAnnotation(annotationId: number): TimelineAnnotation | null {
        const annotationIdx = this.timelineAnnotations.map(a=>a.state.id).indexOf(annotationId);
        if (annotationIdx == -1) return null;
        return this.timelineAnnotations[annotationIdx];
    }

    updateTimelineAnnotation(state: TimelineAnnotationState) {
        const timelineAnnotation = this.getTimelineAnnotation(state.id);
        const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(state.id);
        if (timelineAnnotation === null || timelineAnnotationStateIdx == -1) return null;
        timelineAnnotation.state = state;
        this.state.timelineAnnotations[timelineAnnotationStateIdx] = state;

        timelineAnnotation.draw();
    }

    updateTimelineAnnotationWithoutTracking(state: TimelineAnnotationState) {
        const timelineAnnotation = this.getTimelineAnnotation(state.id);
        const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(state.id);
        if (timelineAnnotation === null || timelineAnnotationStateIdx == -1) return null;
        timelineAnnotation.state = state;
        timelineAnnotation.draw();
    }

}

interface AnnotationEvents {
    "annotation.timechange": Array<(event: {oldState: TimelineAnnotationState, newState: TimelineAnnotationState}) => void>,
}

class TimelineAnnotation {
    state: TimelineAnnotationState
    table: Table

    events: AnnotationEvents

    rootElem: HTMLElement
    detailElem: HTMLElement = document.createElement("span");
    startElem: HTMLElement = document.createElement("span");
    endElem: HTMLElement = document.createElement("span");
    detailsElem: HTMLDetailsElement
    formElem: HTMLDivElement

    readonly: boolean

    constructor(table: Table, state: TimelineAnnotationState, readonly=true) {
        this.table = table;
        this.state = state;
        this.readonly = readonly;

        if (this.state.type == "interval") {
            this.rootElem = this.initInterval();
        }
        this.events = {
            "annotation.timechange": [],
        };
        this.subscribeEvents();
        this.draw();
    }

    initInterval() {
        const elem = document.createElement("div");
        elem.setAttribute("class", "beholder-annotation-table-row");
        this.table.rowsElem.appendChild(elem);

        this.detailsElem = document.createElement("details");
        const summary = document.createElement("summary");
        const summaryContainer = document.createElement("div");
        const startContainer = document.createElement("div");
        summary.appendChild(this.detailElem);
        this.detailElem.innerText = `${this.state.channelId}:${this.state.label}`;
        summaryContainer.appendChild(startContainer);
        startContainer.appendChild(this.startElem);
        const endContainer = document.createElement("div");
        summaryContainer.appendChild(endContainer);
        endContainer.appendChild(this.endElem);
        summary.appendChild(summaryContainer);
        this.detailsElem.appendChild(summary);
        elem.appendChild(this.detailsElem);
        return elem;
    }

    formioReadOnly() {
        const components = [];
        const mainLabel = {
            type: "textfield",
            key: "label",
            label: "<strong>label:</strong>",
            defaultValue: this.state.label,
            disabled: true
        }
        components.push(mainLabel);
        for (const modifier of this.state.modifiers) {
            const modifierLabel = {
                type: "textfield",
                key: modifier.label,
                label: modifier.label,
                defaultValue: modifier.value,
                disabled: true
            };
            components.push(modifierLabel);
        }
        const payload = {components: components}
        console.log(payload);
        return payload
    }

    formioData() {

        return {
          components: [
              {
                type: "select",
                key: "label",
                defaultValue: this.state.label,
                label: "behavior",
                tooltip: '<strong>behavior</strong>',
                input: true,
                data: {
                    values: [
                        {
                            value: "blah",
                            label: "Blah"
                        },
                        {
                            value: "blah2",
                            label: "Blah2"
                        }
                    ]
                }
              },
              {
                type: "textfield",
                key: "modifier",
                defaultValue: this.state.label,
                label: "modifier",
                tooltip: '<strong>modifier</strong>',
                input: true,
                data: {
                    values: [
                        {
                            value: "blah",
                            label: "Blah"
                        },
                        {
                            value: "blah2",
                            label: "Blah2"
                        }
                    ]
                },
                "conditional": {
                  "json": {
                    "===": [
                      {
                        "var": "data.label"
                      },
                      "blah2"
                    ]
                  }
                }
              },
              {
                type: "number",
                key: "startTime",
                label: "startTime",
                tooltip: '<strong>start video frame</strong>',
                defaultValue: this.state.startTime,
                disabled: true
              },
              {
                type: "number",
                key: "endTime",
                label: "endTime",
                tooltip: '<strong>end video frame</strong>',
                defaultValue: this.state.endTime,
                disabled: true
              }
            ]
        }
    }

    openDetails() {
        this.formElem = document.createElement("div");
        this.detailsElem.appendChild(this.formElem);
        if (this.readonly) {
            Formio.createForm(this.formElem, this.formioReadOnly());
        }
    }

    closeDetails() {
        this.formElem.parentNode.removeChild(this.formElem);

    }

    subscribeEvents() {
        this.detailsElem.addEventListener("toggle", () => {
            if (this.detailsElem.open) {
                this.openDetails();
            } else {
                this.closeDetails();
            }
        });
    }

    draw() {
        this.startElem.innerText = `start: ${new Date(this.state.startTime).toISOString().slice(11,23)}`;
        this.endElem.innerText = `end: ${new Date(this.state.endTime).toISOString().slice(11,23)}`;
    }

    delete() {
        this.rootElem.parentNode.removeChild(this.rootElem);
    }

}
