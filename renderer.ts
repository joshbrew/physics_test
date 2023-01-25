
//import * as B from 'babylonjs'
//import * as THREE from 'three'
import { 
    WorkerCanvasControls, 
    WorkerService, 
    Loader,
    GraphNode, 
    WorkerInfo
} from 'graphscript'//'../graphscript/index'//'graphscript'

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
    const navigation = graph.addWorker({url:renderworker}) as WorkerInfo;
    const physics = graph.addWorker({url:physicsworker}) as WorkerInfo;

    //the physics thread will update the positions of the entities
    // alternatively user inputs can update the positions/forces on the physics thread
    const physicsPort = graph.establishMessageChannel(
        renderer.worker, 
        physics.worker
    );

    //the navigation algorithm will update accelerations on the physics thread
    const navPort = graph.establishMessageChannel(
        renderer.worker,
        navigation.worker
    )

    const navPhysicsPort = graph.establishMessageChannel(
        navigation.worker,
        physics.worker
    )

    node.physics = physics;
    node.navigation = navigation;

    // elm.addEventListener('click', () => {
    //     elm.requestPointerLock();
    // });


    await navigation.run('initEngine',
    {
        _id:elm.id,
        entities
    });

    let crowds = {};
    let navMeshes = [] as string[];
    let targets = {};

    entities?.forEach((o) => {
        if(o.crowd) {
            if(!crowds[o.crowd]) crowds[o.crowd] = [];
            crowds[o.crowd].push(o._id);
        }
        if(o.navMesh) {
            navMeshes.push(o._id);
        }
        if(o.targetOf) targets[o.targetOf] = o._id;
    })

    let meshId = await navigation.run(
        'createNavMesh', 
        [
            navMeshes,
            undefined,
            true,
            navPort
        ]
    );
    
    for(const key in crowds) {
        let crowdId = await navigation.run(
            'createCrowd', 
            [
                crowds[key], 
                targets[key]
            ]
        );
    }

    //now let's setup the rapier thread to tell the render thread what to do

    physics.run('initWorld', [
        entities, 
        { x: 0.0, y: -9.81, z:0 }
    ]).then(async () => {

        node.renderer = await graph.run( 
            'transferCanvas',
            renderer.worker,
            {
                canvas:elm,
                context:undefined,
                _id:elm.id,
                entities
            },
            'receiveBabylonCanvas'
        ) as WorkerCanvasControls;

        physics.post('subscribeToWorker', [
            'animateCrowd',
            navPhysicsPort,
            'updatePhysicsEntities'
        ])

        navigation.post('subscribeToWorker',[
            'stepWorld',
            navPhysicsPort,
            'updateEntities'
        ]);

        renderer.post('subscribeToWorker',[
            'stepWorld',
            physicsPort,
            'updateEntities'
        ]); //runs entirely off main thread


        physics.post('animateWorld', [true, false]);
    });

}