import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";

function randomFloat(n: number) {
    return Math.random() * n
}

function range(start: number, end: number, useFloat = false) {
    // case where there is no range
    if (end === start) {
        return end
    }
    return randomFloat(end - start) + start
}

export class BG extends PIXI.Container {
    private readonly screenWidth: number;
    private readonly screenHeight: number;
    constructor(screenWidth: number, screenHeight: number) {
        super();
        this.screenWidth = screenWidth;
        this.screenHeight = screenHeight;
        this.interactive = false;
        this.interactiveChildren = false;
        const bg = PIXI.Sprite.from('./spectrogram.png');
        bg.interactive = false;
        bg.width = this.screenWidth
        bg.height = this.screenHeight;
        bg.anchor.set(0.5, 0.5);
        this.addChild(bg);
    }
}