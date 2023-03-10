import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { Cull } from '@pixi-essentials/cull';
import { Scene } from './scenes/scene'; // This is the import statement
import { Container } from 'pixi.js';

const W = 1000;
const H = 500;

const app = new PIXI.Application({
	view: document.getElementById("pixi-canvas") as HTMLCanvasElement,
	resolution: window.devicePixelRatio || 1,
	autoDensity: true,
	backgroundColor: 0x6495ed,
	width: W,
	height: H
});
const renderer = app.renderer;
// create viewport
const viewport = new Viewport({
    screenWidth: W,
    screenHeight: H,
    worldWidth: W,
    worldHeight: H,
    interaction: app.renderer.plugins.interaction // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
})

// add the viewport to the stage
app.stage.addChild(viewport);

const elem = document.getElementById("svg");
var svgimg = document.createElementNS('http://www.w3.org/2000/svg','image');
svgimg.setAttribute('href','./spectrogram.png');
svgimg.setAttribute('height','100');
svgimg.setAttribute('width','1000');
svgimg.setAttribute("preserveAspectRatio", "none");
elem?.setAttribute("preserveAspectRatio", "none");
elem?.appendChild(svgimg);

// activate plugins
viewport
    .drag({direction: 'x', mouseButtons: 'all'})
    .pinch({axis: 'x'})
    .wheel({axis: 'x'})
    .clamp({direction: 'x'})
	.clampZoom({minScale: 1});
viewport.fit();
viewport.moveCenter(W/2, H/2);


//const bg: BG = new BG(app.screen.width, 100);
//viewport.addChild(bg);
const sceny: Scene = new Scene(app.screen.width, app.screen.height);
const line = viewport.addChild(new PIXI.Graphics())
viewport.addChild(sceny);
line.lineStyle(10, 0xff0000).drawRect(0, 0, viewport.worldWidth, viewport.worldHeight)


const cull = new Cull().addAll(viewport.children);
let cullDirty = false;
let altered = false;

const textCont = new Container();
viewport.addChild(textCont);
const N = 1000;
const text: PIXI.Text[] = [...Array(N).keys()].map(i => {
    const t = new PIXI.Text("", {fontSize: 12});
    t.y = -100;
    textCont.addChild(t);
    return t;
});
const a2t = {};

viewport.on('frame-end', function() {
    if (viewport.dirty || cullDirty) {
        cull.cull(renderer.screen);

        viewport.dirty = false;
        cullDirty = false;
    }
    if (altered && sceny._maxSize/viewport.scale.x <= 1000) {
        const inView = sceny.rects.search(viewport.left, viewport.right);
        if (inView.length <= N) {
            inView.forEach(annotation => {
                if (a2t.hasOwnProperty(annotation.id)) {
                    // @ts-ignore
                    a2t[annotation.id].scale.x = 1/viewport.scale.x;
                } else {
                    const t = text.pop();
                    if (t === undefined) return;
                    // @ts-ignore
                    a2t[annotation.id] = t;
                    t.text = `${annotation.sprite.x}`;
                    t.x = annotation.sprite.x;
                    t.y = annotation.sprite.y;
                    t.scale.x = 1/viewport.scale.x;
                }
            });
        }
        altered = false;
    }
})
viewport.on("moved", function(e) {
    elem?.setAttribute("viewBox", `${viewport.left} 0 ${viewport.right - viewport.left} 100`);
    //texts.scale.x = 1/viewport.scale.x;
    altered = true;
});
viewport.on("zoomed", function(e) {
    cursor.scale.x = 1/viewport.scale.x;
    altered = true;
})
const cursor = viewport.addChild(new PIXI.Graphics())
cursor.lineStyle(1, 0xFFFFFF).drawRect(0, 0, 0, viewport.worldHeight)
cursor.alpha = 0.5;
cursor.interactive = true;
app.stage.interactive = true;

//const text = new PIXI.Text("hello");
//text.updateText(false);
//const texts = new PIXI.Sprite(text.texture);
//viewport.addChild(texts);
app.stage.on('pointermove', (e) => {
    const x = viewport.left + e.data.global.x / viewport.scale.x;
    sceny.hit(
        x,
        e.data.global.y
    );
    cursor.x = x;
    cursor.scale.x = 1/viewport.scale.x;
});

