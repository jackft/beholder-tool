import * as state from './state';
import { Annotator } from './annotator';

import { CellComponent, RowComponent, TabulatorFull as Tabulator } from 'tabulator-tables';
import { ModifierFlags } from 'typescript';

interface TableEvents {
    "selectTimelineAnnotation": Array<(state: state.TimelineAnnotationState) => void>
    "deselectTimelineAnnotation": Array<(state: state.TimelineAnnotationState) => void>
    "updateTimelineAnnotation": Array<(state: state.TimelineAnnotationState) => void>
}

export interface Table {
    batchCreateTimelineAnnotation(states: Array<state.TimelineAnnotationState>): void
    createTimelineAnnotation(state: state.TimelineAnnotationState): void
    updateTimelineAnnotation(state: state.TimelineAnnotationState): void
    deleteTimelineAnnotation(state: state.TimelineAnnotationState): void
    selectTimelineAnnotation(state: state.TimelineAnnotationState): void
    deselectTimelineAnnotation(state: state.TimelineAnnotationState): void

    addEventListener(name: "selectTimelineAnnotation" | "updateTimelineAnnotation" | "deselectTimelineAnnotation", handler: (param :any) => void): void
    removeEventListener(name: "selectTimelineAnnotation" | "updateTimelineAnnotation" | "deselectTimelineAnnotation", handler: (param :any) => void)

    resize(height: number): void
}

//create Tabulator on DOM element with id "example-table"
const timeFormatter = (cell, formatterParams, onRendered) => {
    try {
        return new Date(cell.getValue()).toISOString().slice(11, 23)
    } catch (error) {
        return cell.getValue();
    }
}

export class TabulatorTable implements Table {
    public annotator: Annotator
    public table: Tabulator
    private events: TableEvents

    constructor(annotator: Annotator, rootElem: HTMLElement) {
        this.annotator = annotator;
        this.events = {
            "deselectTimelineAnnotation": [],
            "selectTimelineAnnotation": [],
            "updateTimelineAnnotation": []
        }

        const tableElem = document.createElement("div");
        tableElem.setAttribute("class", "beholder-table");
        rootElem.appendChild(tableElem);

        const config = {
            height: 400,
            rowHeight: 30,
            autoResize: true,
            data: [],
            clipboard: true,
            clipboardPasteAction: "replace",
            layout: "fitDataTable",
            scrollToRowPosition: "center",
            columns: [
                { title: "id", field: "id" },
                { title: "Start Time", field: "startTime", formatter: timeFormatter, width: 40 },
                { title: "End Time", field: "endTime", formatter: timeFormatter, width: 40},
                { title: "Channel", field: "channel",  headerFilter: "input", width: 40},
                { title: "value", field: "value", editor: "input", headerFilter: "input", headerFilterParams: {type: "regex"}, hozAlign: "left", width: 200},
            ]
        };
        this.annotator.schema.modifiers.forEach(modifier => {
            const columnConfig = {
                title: modifier.name,
                field: modifier.key,
                editor: modifier.type,
                editorParams: {},
                headerFilter: "input"
            }
            if (modifier.type == "checkbox") {
                // @ts-ignore
                columnConfig.editor = true;
                // @ts-ignore
                columnConfig.formatter = "tickCross";
            }
            if (modifier.editorParams !== null && modifier.editorParams !== undefined) {
                columnConfig.editorParams = modifier.editorParams;
            }
            if (modifier.options !== null) {
                columnConfig.editorParams["values"] = modifier.options;
                columnConfig.editorParams["autocomplete"] = true;
                columnConfig.editorParams["freetext"] = true;
            }
            // @ts-ignore
            config.columns.push(columnConfig);
        });

        // @ts-ignore
        this.table = new Tabulator(tableElem, config);

        this._bindEvents();
    }

    _bindEvents() {
        this.table.on("cellEditing", (cell: CellComponent) => this.cellEditing(cell));
        this.table.on("cellEdited", (cell: CellComponent) => this.cellEdited(cell));
        this.table.on("rowClick", (event: UIEvent, row: RowComponent) => this.rowClicked(event, row));
        this.table.on("cellClick", (event: UIEvent, cell: CellComponent) => this.cellClicked(event, cell));

        this.table.element.addEventListener("keypress", (event) => {
		    if (event.key === "Enter") {
                this.table.navigateDown();
            }
		    if (event.key === " ") {
                event.stopPropagation();
            }
		    if (event.key === "UpArrow") {
                event.stopPropagation();
                this.table.navigatePrev();
            }
		    if (event.key === "DownArrow") {
                event.stopPropagation();
                this.table.navigateNext();
            }
        });
    }

    resize(height: number) {
        if (this.table.element.parentElement === null) return;
        if (this.table.columnManager.getElement() === null) return;
        this.table.setHeight(height);
    }

    cellEditing(cell: CellComponent) {
    }

    cellEdited(cell: CellComponent) {
        const data = cell.getData();
        this.annotator.schema.modifiers.forEach(modifier => {
            // @ts-ignore
            const amodifier = data.modifiers.find(m => m.key == modifier.key);
            if (amodifier === undefined) {
                // @ts-ignore
                data.modifiers.push({
                    // @ts-ignore
                    "id": data.modifiers.length == 0 ? 0 : Math.max(...data.modifiers.map(m => m.id)) + 1,
                    "key": modifier.key,
                    "value": data[modifier.key]
                });
            } else {
                amodifier["value"] = data[modifier.key];
            }
        });
        // @ts-ignore
        this.events.updateTimelineAnnotation.forEach(f => f(data));
    }

    rowClicked(event: UIEvent, row: RowComponent) {
        this.annotator.timeline.selectionGroup.map(x=>x).forEach(
            annotation => {
                this.events.deselectTimelineAnnotation.forEach(f => f(annotation.state))
            }
        );
        this.events.selectTimelineAnnotation.forEach(f => f(row.getData()));
    }

    cellClicked(event: UIEvent, cell: CellComponent) {
        if (cell.getField() == "startTime" || cell.getField() == "endTime") {
            this.annotator.updateTime(cell.getValue());
        }
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
            this.table.setSort([
                {column:"startTime", dir:"asc"}, //sort by this first
            ]);
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
