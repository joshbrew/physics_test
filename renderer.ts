
//import * as B from 'babylonjs'
//import * as THREE from 'three'
import { 
    WorkerCanvasControls, 
    WorkerService, 
    Loader,
    GraphNode, 
    WorkerInfo
} from '../graphscript/index'//'graphscript'

import {PhysicsEntityProps} from './workers/types'

// import keyboard from 'keyboardjs'

// import RAPIER from '@dimforge/rapier3d-compat'

//make as direct children of a renderer node that runs the below function
let entityLoader:Loader = (node,parent,graph,roots,properties,key) => {}


import physicsworker from './workers/physics.worker'
import renderworker from './workers/renderer.worker'


export async function createRenderer(
    elm:HTMLCanvasElement, 
    node:GraphNode, 
    graph:WorkerService, 
    entities?:PhysicsEntityProps[]
) {

    //console.log(graph, elm);
    const renderer = graph.addWorker({url:renderworker}) as WorkerInfo;
    const physics = graph.addWorker({url:physicsworker}) as WorkerInfo;

    const portId = graph.establishMessageChannel(
        renderer.worker, 
        physics.worker
    );

    node.physics = physics;

    // elm.addEventListener('click', () => {
    //     elm.requestPointerLock();
    // });

    node.renderer = await graph.run( 
        'transferCanvas',
        renderer.worker,
        {
            canvas:elm,
            context:undefined,
            _id:elm.id,
            entities,
            portId
        },
        'receiveBabylonCanvas'
    ) as WorkerCanvasControls;

    //now let's setup the rapier thread to tell the render thread what to do

    physics.run('initWorld', [entities, { x: 0.0, y: -9.81, z:0 }]).then(() => {
        renderer.post('subscribeToWorker',[
            'stepWorld',
            portId,
            'updateCanvas'
        ]); //runs entirely off main thread


        physics.post('animateWorld', [true,false]);
    });

    renderer.run('subscribeToWorker',[]);
}