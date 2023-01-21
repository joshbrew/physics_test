//import * as B from 'babylonjs'
//import * as THREE from 'three'
import { WorkerInfo } from 'graphscript';
import { 
    WorkerCanvas, 
    WorkerCanvasControls, 
    WorkerService, 
    htmlloader, 
    workerCanvasRoutes 
} from 'graphscript' //'../graphscript/index'//

import {PhysicsEntity} from './workers/types'

// import keyboard from 'keyboardjs'

// import RAPIER from '@dimforge/rapier3d-compat'

import physicsworker from './workers/physics.worker'
import renderworker from './workers/renderer.worker'

    let graph = new WorkerService({
        roots:{
            ...workerCanvasRoutes,
            canvas:{
                __element:'canvas',
                style:{width:'100%', height:'100%'},
                __onrender:async function(elm) {

                    //console.log(graph, elm);
                    const renderer = graph.addWorker({url:renderworker}) as WorkerInfo;
                    const physics = graph.addWorker({url:physicsworker}) as WorkerInfo;

                    const portId = graph.establishMessageChannel(
                        renderer.worker, 
                        physics.worker
                    );

                    // elm.addEventListener('click', () => {
                    //     elm.requestPointerLock();
                    // });

                    let initialBallPosition = {x:0.0,y:10.0,z:0};
                    let ballRadius = 1;
                    
                    let initialGroundPosition = {x:0,y:0,z:0}//{width:10, height:2, depth:10};
                    let groundDimensions = {width:10, height:2, depth:10};

                    const controls = await graph.run(
                        'transferCanvas',
                        renderer.worker,
                        {
                            canvas:elm,
                            context:undefined,
                            _id:elm.id,
                            
                            initialBallPosition,
                            ballRadius,
                            initialGroundPosition,
                            groundDimensions,


                            init:function (self:WorkerCanvas,canvas,context) {
                                
                                //this is a hack
                                globalThis.document.addEventListener = (...args:any[]) => {
                                    canvas.addEventListener(...args);
                                } 

                                const BABYLON = self.BABYLON;
                                const engine = new BABYLON.Engine(canvas);
                                const scene = new BABYLON.Scene(engine);
                                const camera = new BABYLON.FreeCamera(
                                    'cam1', 
                                    new BABYLON.Vector3(-50,10,0), 
                                    scene
                                );

                                camera.attachControl(canvas,false);
                                console.log(camera);

                                canvas.addEventListener('resize', () => { 
                                    engine.setSize(canvas.clientWidth,canvas.clientHeight); //manual resize
                                });
                                setTimeout(() => { engine.setSize(canvas.clientWidth,canvas.clientHeight);  });

                                const light = new BABYLON.HemisphericLight(
                                    'light1', 
                                    new BABYLON.Vector3(0,1,0), 
                                    scene
                                )

                                const ball = new BABYLON.MeshBuilder.CreateSphere(
                                    'ball',
                                    {diameter:self.ballRadius*2, segments: 32}, 
                                    scene
                                )
                                
                                ball.position.x = self.initialBallPosition.x;
                                ball.position.y = self.initialBallPosition.y;
                                ball.position.z = self.initialBallPosition.z;

                                self.ball = ball;

                                const ground = new BABYLON.MeshBuilder.CreateBox(
                                    'ground',
                                    self.groundDimensions,
                                    scene
                                );

                                ground.position.x = self.initialGroundPosition.x;
                                ground.position.y = self.initialGroundPosition.y;
                                ground.position.z = self.initialGroundPosition.z;
                                
                                self.ground = ground;

                                camera.setTarget(ball.position);

                                self.engine = engine;
                                self.scene = scene;
                                self.camera = camera;
                            },
                            draw:function (self:WorkerCanvas,canvas,context) {
                                self.scene.render();
                            },
                            update:function (self:WorkerCanvas, canvas, context, 
                                data:{[key:string]:{ position:{x:number,y:number,z:number}, rotation:{x:number,y:number,z:number,w:number} }}) {
                                
                                self.ball.position.x = data.ball.position.x;
                                self.ball.position.y = data.ball.position.y;
                                self.ball.position.z = data.ball.position.z;

                                self.ground.position.x = data.ground.position.x;
                                self.ground.position.y = data.ground.position.y;
                                self.ground.position.z = data.ground.position.z;

                            },
                            clear:function (self:WorkerCanvas, canvas, context) {
                                self.scene.dispose();
                            }
                        },
                        'receiveBabylonCanvas'
                    ) as WorkerCanvasControls;

                    //now let's setup the rapier thread to tell the render thread what to do

                    physics.run('initWorld', { x: 0.0, y: -9.81, z:0 }).then(() => {
                        renderer.post('subscribeToWorker',[
                            'stepWorld',
                            portId,
                            'updateCanvas'
                        ]);

                        physics.run('addPhysicsEntity',{
                            _id:'ball',
                            collisionType:'ball',
                            collisionTypeParams:[1],
                            dynamic:true,
                            restitution:2,
                            position:initialBallPosition
                        } as PhysicsEntity)

                        physics.run('addPhysicsEntity',{
                            _id:'ground',
                            collisionType:'cuboid',
                            collisionTypeParams:[groundDimensions.width*.5,groundDimensions.height*.5,groundDimensions.depth*.5],
                            dynamic:false,
                            position:initialGroundPosition
                        } as PhysicsEntity)

                        physics.run('animateWorld', [true,false]);
                    });
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


