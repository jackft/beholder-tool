import { Formio } from 'formiojs';
import { Layout, TimelineState, TimelineAnnotationState } from './state';
import { inJestTest } from './utils';


interface TableSelectEvent {
    annotation: TimelineAnnotation;
    timeMs: number;
}

interface TableEvents {
    "table.resize": Array<(event: ResizeObserverEntry) => void>,
    "table.rowSelected": Array<(event: TableSelectEvent) => void>,

}

function deepCopy(o) {return JSON.parse(JSON.stringify(o))}

export class Table {
    readonly: boolean = false
    rootElem: HTMLElement
    rowsElem: HTMLElement
    channelFilterGroupElem: HTMLElement
    channelFilterElem: HTMLSelectElement
    typeFilterElem: HTMLElement
    state: TimelineState
    events: TableEvents
    layout: Layout
    schema: Object | null

    tabSelected: "timeline" | "media" | "entity"
    channelIdSelected: number | null = null
    typeSelected: String | null

    timelineAnnotations: Array<TimelineAnnotation>

    constructor(rootElem: HTMLElement, state: TimelineState, layout: Layout, readonly=false, schema=null) {
        this.readonly = readonly;
        this.rootElem = rootElem;
        this.state = state;
        this.layout = layout;
        this.schema = schema;

        this.timelineAnnotations = [];

        this.events = {
            "table.resize": [],
            "table.rowSelected": []
        };

        this.initTable();
        this.subscribeToEvents();

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
        this.channelFilterElem.addEventListener("input", (event) => {
            if (+this.channelFilterElem.value < 0) {
                this.channelIdSelected = null;
            } else {
                this.channelIdSelected = +this.channelFilterElem.value;
            }
            this.hideAnnotations();
        });
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
        this.draw();
        return ta;
    }

    deleteTimelineAnnotation(timelineAnnotationId) {
        const timelineAnnotationIdx = this.timelineAnnotations.map(a=>a.state.id).indexOf(timelineAnnotationId);
        if (timelineAnnotationIdx == -1) return null;
        this.timelineAnnotations[timelineAnnotationIdx].delete();
        this.timelineAnnotations.splice(timelineAnnotationIdx, 1);
        const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(timelineAnnotationId);
        if (timelineAnnotationStateIdx !== -1) {
            this.state.timelineAnnotations.splice(timelineAnnotationStateIdx, 1);
        };
        this.draw();
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
        this.draw();
    }

    updateTimelineAnnotationWithoutTracking(state: TimelineAnnotationState) {
        const timelineAnnotation = this.getTimelineAnnotation(state.id);
        const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(state.id);
        if (timelineAnnotation === null || timelineAnnotationStateIdx == -1) return null;
        timelineAnnotation.state = state;
        timelineAnnotation.draw();
        this.draw();
    }

    selectTimelineAnnotation(timelineAnnotationId) {
        this.timelineAnnotations.forEach(x => x.deselect());
        const timelineAnnotation = this.getTimelineAnnotation(timelineAnnotationId);
        timelineAnnotation.select();
    }

    draw() {
        this.hideAnnotations();
        this.sortAnnotations();
    }

    hideAnnotations() {
        this.timelineAnnotations
            .forEach(annotation => {
                if (this.channelIdSelected === null) {
                    annotation.show();
                }
                else if (this.channelIdSelected == annotation.state.channelId) {
                    annotation.show();
                } else {
                    annotation.hide();
                }
            });
    }

    sortAnnotations() {
        this.timelineAnnotations
            .sort((lhs, rhs) => lhs.state.startTime - rhs.state.startTime)
            .forEach((annotation, i) => annotation.rootElem.style.setProperty("order", `${i}`));
    }

}

interface AnnotationEvents {
    "annotation.timechange": Array<(event: {oldState: TimelineAnnotationState, newState: TimelineAnnotationState}) => void>,
    "annotation.click": Array<(timelineAnnotationId: number) => void>
    "annotation.datachange": Array<(state: TimelineAnnotationState) => void>
}

class TimelineAnnotation {
    state: TimelineAnnotationState
    table: Table
    selected: boolean = false

    events: AnnotationEvents

    rootElem: HTMLElement
    detailElem: HTMLElement = document.createElement("span");
    channelElem: HTMLElement = document.createElement("span");
    startElem: HTMLElement = document.createElement("span");
    endElem: HTMLElement = document.createElement("span");
    detailsElem: HTMLDetailsElement
    formElem: HTMLDivElement

    readonly: boolean

    constructor(table: Table, state: TimelineAnnotationState) {
        this.table = table;
        this.state = state;
        this.readonly = table.readonly;

        if (this.state.type == "interval") {
            this.rootElem = this.initInterval();
        }
        this.events = {
            "annotation.timechange": [],
            "annotation.click": [],
            "annotation.datachange": []
        };
        this.subscribeEvents();
        this.draw();
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

    initInterval() {
        const elem = document.createElement("div");
        elem.setAttribute("class", "beholder-annotation-table-row");
        this.table.rowsElem.appendChild(elem);

        const timeElem = document.createElement("div");
        timeElem.classList.add("beholder-annotation-table-row-time-elem");
        const startContainer = document.createElement("div");
        timeElem.appendChild(startContainer);
        startContainer.appendChild(this.startElem);
        const divider = document.createElement("div");
        timeElem.appendChild(divider);
        divider.innerHTML = "&#9135;&#9135;&#9135;";
        const endContainer = document.createElement("div");
        endContainer.appendChild(this.endElem);
        timeElem.appendChild(endContainer);
        elem.appendChild(timeElem);

        const channelElemCont = document.createElement("div");
        channelElemCont.appendChild(this.channelElem);
        this.channelElem.classList.add("beholder-annotation-table-row-channel-elem");
        elem.appendChild(channelElemCont);

        this.detailsElem = document.createElement("details");
        const summary = document.createElement("summary");
        const summaryContainer = document.createElement("div");
        summary.appendChild(this.detailElem);
        summary.appendChild(summaryContainer);
        this.detailsElem.appendChild(summary);
        elem.appendChild(this.detailsElem);
        return elem;
    }

    channelName() {
        const channelStateIdx = this.table.state.channels.map(c=>c.id).indexOf(this.state.channelId);
        if (channelStateIdx === -1) return this.state.channelId;
        return this.table.state.channels[channelStateIdx].name
    }

    formio() {
        const schema = deepCopy(this.table.schema);
        for (let component of schema["components"]) {
            if (this.state.label !== undefined && component["label"] === "label") {
                component["defaultValue"] = this.state.label;
            } else {
                for (let modifier of this.state.modifiers) {
                    if (modifier.value !== undefined && component["label"] == modifier.label) {
                        component["defaultValue"] = modifier.value;
                    }
                }
            }
        }
        return schema;
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
        return payload
    }

    openDetails() {
        this.formElem = document.createElement("div");
        this.detailsElem.appendChild(this.formElem);
        if (this.readonly) {
            Formio.createForm(this.formElem, this.formioReadOnly());
        } else {
            Formio.createForm(this.formElem, this.formio())
                  .then(form => this._bindFormEvents(form));
        }
    }

    _bindFormEvents(form) {
        form.on("change", (event) => this.change(form, event));
    }

    change(form, event) {
        const key = event.changed.component.key;
        const value = event.changed.value;
        if (key === "label") {
            this.state.label = value;
            this.draw();
        } else {
            for (let modifier of this.state.modifiers) {
                if (modifier.label === key) {
                    modifier.value = value;
                    for (let component of form.components) {
                        if (component.path === modifier.label) {
                            component.component.defaultValue = value;
                        }
                    }
                }
            }
        }
        this.events["annotation.datachange"].forEach(f => f(this.state));
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
        this.startElem.addEventListener("click", (event) => {
            event.stopPropagation();
            this.events["annotation.click"].forEach(f => f(this.state.id));
            const tableSelectEvent = {
                annotation: this,
                timeMs: this.state.startTime
            };
            this.table.events["table.rowSelected"].forEach(f => f(tableSelectEvent));
        });
        this.endElem.addEventListener("click", (event) => {
            event.stopPropagation();
            this.events["annotation.click"].forEach(f => f(this.state.id));
            const tableSelectEvent = {
                annotation: this,
                timeMs: this.state.endTime
            };
            this.table.events["table.rowSelected"].forEach(f => f(tableSelectEvent));
        });
        this.rootElem.addEventListener("click", (event) => {
            this.events["annotation.click"].forEach(f => f(this.state.id));
            const tableSelectEvent = {
                annotation: this,
                timeMs: this.state.startTime
            };
            this.table.events["table.rowSelected"].forEach(f => f(tableSelectEvent));
        });
    }

    draw() {
        this.startElem.innerText = `${new Date(this.state.startTime).toISOString().slice(11,23)}`;
        this.endElem.innerText = `${new Date(this.state.endTime).toISOString().slice(11,23)}`;
        this.channelElem.innerText = `${this.channelName()}`;
        this.detailElem.innerText = `${this.state.label}`;
    }

    delete() {
        this.rootElem.parentNode.removeChild(this.rootElem);
    }

    select() {
        this.rootElem.classList.add("selected");
        this.selected = true;
    }

    deselect() {
        this.rootElem.classList.remove("selected");
        this.selected = false;
    }

    hide() {
        this.rootElem.style.setProperty("display", "none");
    }

    show() {
        this.rootElem.style.removeProperty("display");
    }

}
