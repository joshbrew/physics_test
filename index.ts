/*
    TODO:
        Fix camera controls on thread (might have to implement my own <_<)
        Wrap mesh and physics settings together for a single init process
        Implement navmeshes
        Use buffering system to spam a thousand+ entities

*/




//import * as B from 'babylonjs'
//import * as THREE from 'three'
import { WorkerInfo } from 'graphscript';
import { 
    WorkerCanvas, 
    WorkerCanvasControls, 
    WorkerService, 
    htmlloader, 
    workerCanvasRoutes,
    Loader
} from 'graphscript' //'../graphscript/index'//

import {PhysicsEntityProps} from './workers/types'
import physicsworker from './workers/physics.worker'
import renderworker from './workers/renderer.worker'

// import keyboard from 'keyboardjs'

// import RAPIER from '@dimforge/rapier3d-compat'

import { createRenderer } from './renderer';

let renderId = 'canvas';


let graph = new WorkerService({
    roots:{
        ...workerCanvasRoutes,
        [renderId]:{
            __element:'canvas',
            style:{width:'100%', height:'100%'},
            __onrender:async function(elm) {
                createRenderer(
                    elm,
                    this,
                    graph,
                    [
                        {
                            _id:'ball',
                            collisionType:'ball',
                            radius:1,
                            dynamic:true,
                            restitution:2,
                            position:{x:0,y:10,z:0}
                        },
                        {
                            _id:'ground',
                            collisionType:'cuboid',
                            dimensions:{width:10,height:1,depth:10},
                            dynamic:false,
                            position:{x:0,y:0,z:0}
                        }
                    ]
                );
            }
        },

        // testbox:{
        //     __element:'div',
        //     style:{backgroundColor:'blue', height:'50px'},
        //     __onrender:function(elm:HTMLElement) {
        //         console.log(elm,elm.addEventListener);
        //         elm.addEventListener('focus', (ev) => {console.log(ev)})
        //     }
        // }
    },
    loaders:{
        htmlloader
    }
});

// RAPIER.init().then(() => {
    
//     //create Rapier3D context
//     let gravity = { x: 0.0, y: -9.81, z:0 };
//     let world = new RAPIER.World(gravity);

//     let initialPosition = {x:0.0,y:10.0,z:0};
//     let radius = 1;

//     //create a dynamic rigid body
//     let rigidBody1 = world.createRigidBody(
//         new RAPIER.RigidBodyDesc(
//             RAPIER.RigidBodyType.Dynamic
//         ).setTranslation(initialPosition.x,initialPosition.y,initialPosition.z),
//     );

//     //create a collision model for the body

//     let collider1 = world.createCollider(
//         RAPIER.ColliderDesc.ball(radius).setDensity(1).setRestitution(2), 
//         rigidBody1
//     );

//     //e.g. add an impulse to the body

//     rigidBody1.applyImpulse(
//         new RAPIER.Vector3(0,25,0),true
//     );

//     let groundPosition = {x:0,y:0,z:0};

//     //create ground plane
//     let ground = world.createRigidBody(
//         new RAPIER.RigidBodyDesc(
//             RAPIER.RigidBodyType.Fixed
//         ).setTranslation(groundPosition.x,groundPosition.y,groundPosition.z)
//     );

//     //create a collision model for the ground plane
//     let gcollider = world.createCollider(
//         RAPIER.ColliderDesc.cuboid(10,1,10).setDensity(1),
//         ground
//     );

//     //add to world

    // let canvas = document.createElement('canvas');

    // let engine = new B.Engine(canvas);

    // let scene = new B.Scene(engine);

    // let camera = new B.FreeCamera('camera1', new B.Vector3(-20, 10, 0), scene);

    // camera.attachControl(canvas, false);

    //let model = {

        // engine:{
        //     __props:engine
        // },
    
        // scene:{
        //     __props:scene
        // },
    
        // camera: {
        //     __props:camera,
        // },

        // light: {
        //     __props: new B.HemisphericLight('light1', new B.Vector3(0,1,0), scene)
        // },

        // rigidBody1:{
        //     __props:B.MeshBuilder.CreateSphere('rigidBody1',{diameter:radius*2, segments: 32}, scene),
        //     position: new B.Vector3(
        //         initialPosition.x,
        //         initialPosition.y,
        //         initialPosition.z
        //     ),
        //     __onconnected:function(node) {
        //         camera.setTarget(this.position);
        //     }
        // },

        // ground:{
        //     __props:B.MeshBuilder.CreateBox('ground',{width:10, height:2, depth:10},scene),
        //     position: new B.Vector3(
        //         groundPosition.x,
        //         groundPosition.y,
        //         groundPosition.z
        //     )
        // }
    
    //}


//     let body = graph.get('rigidBody1');

//     engine.runRenderLoop(function(){
//         world.step();
//         let newPosition = rigidBody1.translation();
//         body.position.x = newPosition.x;
//         body.position.y = newPosition.y;
//         body.position.z = newPosition.z;
//         scene.render();

//     });

//     // the canvas/window resize event handler
//     window.addEventListener('resize', function(){
//         engine.resize();
//     });

//     setTimeout(()=>{
//         engine.resize();
//     },0.1)


// });

/// Create a grid map
// Populate grid map with boxes
// Make entities have sphere collisions
// Make entities chase player (also sphere) thru environment
// Conserve momentum with mass collisions

// let a_handler = (ev) => {
//     alert('Pressed a');
//     keyboard.unbind('a',a_handler);
// }

// keyboard.on('a',a_handler); 


