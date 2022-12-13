import * as state from './state';
import { Annotator } from './annotator';

import { CellComponent, RowComponent, TabulatorFull as Tabulator } from 'tabulator-tables';

interface TableEvents {
    "selectTimelineAnnotation": Array<(state: state.TimelineAnnotationState) => void>
    "updateTimelineAnnotation": Array<(state: state.TimelineAnnotationState) => void>
}

export interface Table {
    batchCreateTimelineAnnotation(states: Array<state.TimelineAnnotationState>): void
    createTimelineAnnotation(state: state.TimelineAnnotationState): void
    updateTimelineAnnotation(state: state.TimelineAnnotationState): void
    deleteTimelineAnnotation(state: state.TimelineAnnotationState): void
    selectTimelineAnnotation(state: state.TimelineAnnotationState): void
    deselectTimelineAnnotation(state: state.TimelineAnnotationState): void

    addEventListener(name: "selectTimelineAnnotation" | "updateTimelineAnnotation", handler: (param :any) => void): void
    removeEventListener(name: "selectTimelineAnnotation" | "updateTimelineAnnotation", handler: (param :any) => void)
}

//create Tabulator on DOM element with id "example-table"
const timeFormatter = (cell, formatterParams, onRendered) => {
    return new Date(cell.getValue()).toISOString().slice(11, 23)
}

export class TabulatorTable implements Table {
    public annotator: Annotator
    public table: Tabulator
    private events: TableEvents
    constructor(annotator: Annotator, rootElem: HTMLElement) {
        this.annotator = annotator;
        this.events = {
            "selectTimelineAnnotation": [],
            "updateTimelineAnnotation": []
        }

        const tableElem = document.createElement("div");
        rootElem.appendChild(tableElem);

        const config = {
            height: 459,
            rowHeight: 40,
            data: [],
            layout: "fitDataStretch",
            scrollToRowPosition: "center",
            columns: [
                { title: "Start Time", field: "startTime", formatter: timeFormatter },
                { title: "End Time", field: "endTime", formatter: timeFormatter },
                { title: "Channel", field: "channel",  headerFilter: "list", headerFilterParams:{valuesLookup:true, clearable:true}},
                { title: "value", field: "value", editor: "input", headerFilter: true, hozAlign: "center" },
            ],
        };
        // @ts-ignore
        this.table = new Tabulator(tableElem, config);

        this._bindEvents();
    }

    _bindEvents() {
        this.table.on("cellEdited", (cell: CellComponent) => this.cellEdited(cell));
        this.table.on("rowClick", (event: UIEvent, row: RowComponent) => this.rowClicked(event, row));
    }

    cellEdited(cell: CellComponent) {
        const data = cell.getData();
        // @ts-ignore
        this.events.updateTimelineAnnotation.forEach(f => f(data));
    }

    rowClicked(event: UIEvent, row: RowComponent) {
        this.events.selectTimelineAnnotation.forEach(f => f(row.getData()));
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

    //

    channelName(state: state.TimelineAnnotationState) {
        const channel = this.annotator.timeline.findChannelById(state.channelId);
        if (channel === undefined) return "<none>";
        return channel.state.name;
    }

    batchCreateTimelineAnnotation(states: Array<state.TimelineAnnotationState>): void {
        setTimeout(() => {
            states.forEach(state => state["channel"] = this.channelName(state));
            this.table.addData(states);
        }, 10);
    }

    createTimelineAnnotation(state: state.TimelineAnnotationState): void {
        state["channel"] = this.channelName(state);
        this.table.addData([state]);
    }
    updateTimelineAnnotation(state: state.TimelineAnnotationState): void {
        const row = this.table.getRow(state.id);
        if (!row) return;
        row.update(state);
        // @ts-ignore
        this.table.setSort(this.table.getSorters());
    }
    deleteTimelineAnnotation(state: state.TimelineAnnotationState): void {
        const row = this.table.getRow(state.id);
        if (!row) return;
        row.delete();
    }
    selectTimelineAnnotation(state: state.TimelineAnnotationState): void {
        const row = this.table.getRow(state.id);
        this.table.scrollToRow(state.id, "center", false);
        row.select();
    }
    deselectTimelineAnnotation(state: state.TimelineAnnotationState): void {
        const row = this.table.getRow(state.id);
        row.deselect();
    }
}
