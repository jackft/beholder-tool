import * as PIXI from "pixi.js";
import IntervalTree from 'node-interval-tree';

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

class Annotation {
    id: number
    sprite: PIXI.Sprite;
    constructor(id: number, sprite: PIXI.Sprite) {
        this.id = id;
        this.sprite = sprite;
    }
}

export class Scene extends PIXI.ParticleContainer {
    private readonly screenWidth: number;
    private readonly screenHeight: number;
    public rects: IntervalTree<Annotation>;
    constructor(screenWidth: number, screenHeight: number) {
        const M = 10000;
        super(M, {
            scale: true,
            position: true,
            rotation: true,
            uvs: true,
            alpha: true
        });
        this.rects = new IntervalTree<Annotation>();
        this.screenWidth = screenWidth;
        this.screenHeight = screenHeight;
        this.on("pointerdown", this.down, this);
        this.on("pointerdown", this.down, this);
        for (let i=0; i < M; ++i) {
            let x = Math.random()*this.screenWidth
            let y = Math.random()*this.screenHeight
            const rectangle = PIXI.Sprite.from(PIXI.Texture.WHITE);
            rectangle.width = Math.random()*2;
            rectangle.height = 10;
            rectangle.tint = 0x000000;
            rectangle.x = x;
            rectangle.y = y;
            rectangle.interactive = true;
            rectangle.on("pointerover", this.over, this);
            rectangle.on("pointerout", this.out, this);
            this.addChild(rectangle);
            this.rects.insert(rectangle.x, rectangle.x + rectangle.width, new Annotation(i, rectangle));
        }
    }

    private down() {
        console.log("hi");
        let x = Math.random()*this.screenWidth
        let y = Math.random()*this.screenHeight
        const rectangle = PIXI.Sprite.from(PIXI.Texture.WHITE);
        rectangle.width = 2;
        rectangle.height = 2;
        rectangle.tint = 0xFFFF00;
        rectangle.x = x;
        rectangle.y = y;
        rectangle.interactive = true;
        this.addChild(rectangle);
        //this.rects.push(rectangle);
    }

    //private onDragStart(e: InteractionEvent): void {
    //    const targ = e.target;
    //    // @ts-ignore
    //    this.dragTarget = targ;
    //}

    //private onDragMove(e: InteractionEvent): void {
    //    if (this.dragTarget !== null) {
    //        this.dragTarget.position.copyFrom(e.data.global);
    //    }

    //}

    //private onDragEnd(e: InteractionEvent): void {
    //    // @ts-ignore
    //    this.dragTarget = null;
    //}

    private over(e: PIXI.InteractionEvent): void {
        console.log("hi");
        // @ts-ignore
        const target: PIXI.Sprite = e.target;
        target.tint = 0x0000FF;
    }

    private out(e: PIXI.InteractionEvent): void {
        console.log("ho");
        // @ts-ignore
        const target: PIXI.Sprite = e.currentTarget;
        target.tint = 0x000000;
    }

    //private onCircle(e: InteractionEvent): void {
    //    const targ = e.target;
    //    // @ts-ignore
    //    targ.clear();
    //    // @ts-ignore
    //    targ.beginFill(0xFF0000);
    //    // @ts-ignore
    //    targ.drawRect(0, 0, 2, 4);
    //    // @ts-ignore
    //    targ.endFill();
    //}

    //private offCircle(e: InteractionEvent): void {
    //    const targ = e.currentTarget;
    //    // @ts-ignore
    //    targ.clear();
    //    // @ts-ignore
    //    targ.beginFill(0x000000);
    //    // @ts-ignore
    //    targ.drawRect(0, 0, 2, 4);
    //    // @ts-ignore
    //    targ.endFill();
    //}

    public hit(x: number, y: number) {
        const thing = this.rects.search(x, x).filter((r) => {return r.sprite.x <= x && x < r.sprite.x + r.sprite.width && r.sprite.y <= y && y <= r.sprite.y + r.sprite.height});
        thing.forEach(t => {
            this.rects.remove(t.sprite.x, t.sprite.x + t.sprite.width, t);
            t.sprite.tint=0xFF0000;
            t.sprite.x += 1;
            t.sprite.width += 1;
            this.rects.insert(t.sprite.x, t.sprite.x + t.sprite.width, t);
        });

        //const thing =this.rects.find((r) => {return r.x <= x && x < r.x + r.width && r.y <= y && y <= r.y + r.height});
    }
}
