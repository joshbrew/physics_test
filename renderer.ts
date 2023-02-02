
//import * as B from 'babylonjs'
//import * as THREE from 'three'
import { 
    WorkerCanvasControls, 
    WorkerService, 
    Loader,
    GraphNode, 
    WorkerInfo
} from 'graphscript'//'../graphscript/index'//'graphscript'

import {PhysicsEntityProps} from './src/types'

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

    //the navigation algorithm will update acceaaalerations on the physics thread
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

    // elm.addEventListener("click", async () => {
    //     await elm.requestPointerLock();
    // });

    // window.addEventListener('keydown', (ev) => {
    //     ev.preventDefault();
    //     //console.log(ev);
    // });

    let _id = elm.id ? elm.id : `renderer${Math.floor(Math.random()*1000000000000000)}`;

    await navigation.run('initEngine',{
        _id,
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

    let meshCreated = await navigation.run(
        'createNavMesh', 
        [
            navMeshes,
            undefined,
            true,
            navPort //send the resulting mesh to main thread to render
        ]
    );

    //console.log(meshCreated);
    
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
        { x: 0.0, y: -9.81, z:0 } //down is the y-axis in babylon
    ]).then(async () => {

        node.renderer = await graph.run( 
            'transferCanvas',
            renderer.worker,
            {
                canvas:elm,
                context:undefined,
                _id,
                entities,
                //port Ids
                physicsPort,
                navPort,
                navPhysicsPort
            },
            'receiveBabylonCanvas'
        ) as WorkerCanvasControls;


        //update physics trajectories using the navmesh
        physics.post('subscribeToWorker', [
            'animateCrowd',
            navPhysicsPort,
            'updatePhysicsEntities'
        ]);

        //update entity positions from the physics thread
        navigation.post('subscribeToWorker',[
            'stepWorld',
            navPhysicsPort,
            'updateBabylonEntities'
        ]);

        //update the render thread from the navigation thread
        renderer.post('subscribeToWorker',[
            'updateBabylonEntities',
            navPort,
            'updateBabylonEntities'
        ]); //runs entirely off main thread

        physics.post('animateWorld', [true, false]);
    });

    return {
        _id,
        renderer,
        navigation,
        physics,
        physicsPort,
        navPort,
        navPhysicsPort
    }
};

