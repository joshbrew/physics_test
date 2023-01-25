import { 
    WorkerService, 
    workerCanvasRoutes, 
    remoteGraphRoutes, 
    CanvasProps, 
    WorkerCanvas, 
    isTypedArray, 
    WorkerInfo
} from 'graphscript'//'../../graphscript/index'//'graphscript'
import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps } from './types';

import Recast from  "recast-detour"

declare var WorkerGlobalScope

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:{
            ...workerCanvasRoutes,
            ...remoteGraphRoutes,
            receiveBabylonCanvas:function(
                options:CanvasProps
            ) {

                const BabylonCanvasProps = {
                    BABYLON,
                    init:function (self:WorkerCanvas,canvas,context) {
                
                        //this is a hack
                        globalThis.document.addEventListener = (...args:any[]) => {
                            canvas.addEventListener(...args);
                        } 
        
                        const engine = new BABYLON.Engine(canvas);
                        const scene = new BABYLON.Scene(engine);

                        self.engine = engine;
                        self.scene = scene;

                        self.camera = this.__node.graph.run('attachFreeCamera', 0.5, self);

                        canvas.addEventListener('resize', () => { 
                            engine.setSize(canvas.clientWidth,canvas.clientHeight); //manual resize
                        });

                        setTimeout(() => { engine.setSize(canvas.clientWidth,canvas.clientHeight);  }, 100);
        


                        const light = new BABYLON.SpotLight(
                            'light1', 
                            new BABYLON.Vector3(0,30,0),
                            new BABYLON.Vector3(0,-1,0),
                            1,
                            2,
                            scene
                        )
                        const shadowGenerator = new BABYLON.ShadowGenerator(1024,light);
                        self.shadowGenerator = shadowGenerator;


                        
                        let entityNames = [] as any;
        
                        if(self.entities) { //settings passed from main thread as PhysicsEntityProps[]
                            let meshes = self.entities.map((e,i) => {
                                let mesh = scene.getMeshById(this.__node.graph.run('loadBabylonEntity', e, self)); 
                                entityNames[i] = e._id;
                                return mesh;
                            }) as BABYLON.Mesh[];

                            // try{
                            //     const initRecast = async () => {
                            //         const nav = new BABYLON.RecastJSPlugin(await Recast()); //https://playground.babylonjs.com/#TN7KNN#2
                            //         (globalThis as any).window = {
                            //             Worker,
                            //             addEventListener
                            //         }; //another hack
    

                            //         var navMeshParameters = {
                            //             cs: 0.2,
                            //             ch: 0.2,
                            //             walkableSlopeAngle: 90,
                            //             walkableHeight: 10.0,
                            //             walkableClimb: 5,
                            //             walkableRadius: 1,
                            //             maxEdgeLen: 12.,
                            //             maxSimplificationError: 1.3,
                            //             minRegionArea: 8,
                            //             mergeRegionArea: 20,
                            //             maxVertsPerPoly: 6,
                            //             detailSampleDist: 6,
                            //             detailSampleMaxError: 1,
                            //         } as BABYLON.INavMeshParameters;
                                
                            //         let filtered = meshes.filter((m,i) => {
                            //             if(m.id === 'ground') return true;
                            //         });

                            //         let merged = BABYLON.Mesh.MergeMeshes(filtered, false);

                            //         if(merged) merged.visibility = 0;

                            //         let worker = new Worker(`${location.origin}/dist/navmeshwkr.js`);
                            //         // worker.addEventListener('onmessage', (msg) => {
                            //         //     console.log('message', msg);
                            //         // });
                            //         //@ts-ignore
                            //         //nav._worker.postMessage('test'); //test

                            //         //nav.setWorkerURL(`${location.origin}/dist/navmesh.worker.js`);
                            //         //@ts-ignore
                            //         nav._worker = worker;

                            //         const withNavMesh = (navMeshData) => {
                            //             console.log("got worker data", navMeshData);
                            //             if(isTypedArray(navMeshData)) nav.buildFromNavmeshData(navMeshData);

                            //             let navmeshdebug = nav.createDebugNavMesh(scene);
                            //             navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
                            //             nav.setTimeStep(1/60);

                            //             let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
                            //             matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
                            //             matdebug.alpha = 0.2;
                            //             navmeshdebug.material = matdebug;

                            //             let crowd = nav.createCrowd(10, 0.1, scene);

                            //             let agentParams = {
                            //                 radius: 0.1,
                            //                 height: 0.2,
                            //                 maxAcceleration: 4.0,
                            //                 maxSpeed: 1.0,
                            //                 collisionQueryRange: 0.5,
                            //                 pathOptimizationRange: 0.1,
                            //                 separationWeight: 1.0
                            //             } as BABYLON.IAgentParameters;

                            //             let entity = meshes.find((o,i) => { if(o.id === 'ball') return true;  }) as BABYLON.Mesh;
                            //             let transform = new BABYLON.TransformNode('ballt',scene);

                            //             crowd.addAgent(nav.getClosestPoint(entity.position), agentParams, transform);

                            //             let target = meshes.find((o,i) => { if(o.id.includes('capsule')) return true; }) as BABYLON.Mesh;
                            //             let point = nav.getClosestPoint(target.position);
                                        
                            //             // let pathPoints = nav.computePath(crowd.getAgentPosition(0), point);
                            //             // let pathLine = BABYLON.MeshBuilder.CreateDashedLines("ribbon", {points: pathPoints, updatable: true}, scene);

                            //             crowd.agentGoto(0, point);

                            //             console.log(crowd);

                            //             let tick = 0;
                            //             scene.onBeforeRenderObservable.add(() => {
                            //                 tick++;

                            //                 let fps = engine.getFps();
                            //                 if(tick % fps === 0) {
                            //                     let point = nav.getClosestPoint(target.position);
                                                
                            //                     crowd.agentTeleport(0, entity.position);
                            //                     crowd.agentGoto(0, point);
                                            
                            //                 }
                            //                 crowd.update(1/fps);
                            //                 let agentVelocity = crowd.getAgentVelocity(0);


                            //                 let agentUpdates = {};

                            //                 let _fps = 1/fps;
                            //                 let acceleration = {
                            //                     x:agentVelocity.x*_fps, 
                            //                     y:agentVelocity.y*_fps,
                            //                     z:agentVelocity.z*_fps
                            //                 };

                            //                 agentUpdates[entity.id] = {acceleration};

                            //                 this.__node.graph.workers[self.physicsPort]?.run('updatePhysicsEntity', [entity.id,agentUpdates[entity.id]]);
                                            
                            //                 // entity.position.x = agentPosition.x;
                            //                 // entity.position.y = agentPosition.y + 1;
                            //                 // entity.position.z = agentPosition.z; 
                            //                 //console.log(agentPosition);
                            //             })
                            //         }

                            //         nav.createNavMesh(
                            //             [merged as any], 
                            //             navMeshParameters, 
                            //             withNavMesh
                            //         );
                                   
                            //         // console.log(worker);
    
                            //         console.log(nav);
                            //     }
                            //     initRecast();
                            //     //
                            // } catch(er) {
                            //     console.error(er);
                            // }
                        }

                        return entityNames;
                    },
                    draw:function (self:WorkerCanvas,canvas,context) {
                        self.scene.render();
                    },
        
                    update:function (self:WorkerCanvas, canvas, context, 
                        data:{[key:string]:{ 
                            position:{x:number,y:number,z:number}, 
                            rotation:{x:number,y:number,z:number,w:number} 
                        }}|number[]
                    ) {
                        this.__node.graph.run('updateEntities', data);

                    },
                    clear:function (self:WorkerCanvas, canvas, context) {
                        self.scene.dispose();
                    }
                };

                Object.assign(options,BabylonCanvasProps);

                let renderId = this.__node.graph.run('setupCanvas', options); //the the base canvas tools do the rest, all ThreeJS tools are on self, for self contained ThreeJS renders
                //you can use the canvas render loop by default, or don't provide a draw function and just use the init and the Three animate() callback

                //let canvasopts = this.graph.CANVASES[renderId] as WorkerCanvas;

                return renderId;
            },
            initEngine:function ( //run this on the secondary thread
                ctx?:string|WorkerCanvas|{[key:string]:any}
            ){
                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') ctx = {};
                
                const canvas = ctx.canvas ? ctx.canvas : new OffscreenCanvas(100,100);
                const engine = new BABYLON.Engine(canvas);
                const scene = new BABYLON.Scene(engine);


                ctx.canvas = canvas;
                ctx.engine = engine;
                ctx.scene = scene;

                //duplicating for secondary engine threads (in our case for running a standalone navmesh/crowd animation thread) 
                if(!ctx._id) ctx._id = `canvas${Math.floor(Math.random()*1000000000000000)}`;
                
                if(!this.__node.graph.CANVASES) 
                    this.__node.graph.CANVASES = {} as { [key:string]:WorkerCanvas };
                if(!this.__node.graph.CANVASES[ctx._id]) 
                    this.__node.graph.CANVASES[ctx._id] = ctx;

                if(ctx.entities) {
                    let names = ctx.entities.map((e,i) => {
                        return this.__node.graph.run('loadBabylonEntity', e, self);
                    });

                    return names;
                }

            },
            attachFreeCamera:function (
                speed=0.5,
                ctx?:string|WorkerCanvas
            ) {

                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') return undefined;

                const scene = ctx.scene as BABYLON.Scene;
                const canvas = ctx.canvas as OffscreenCanvas;

                const camera = new BABYLON.FreeCamera(
                    'camera', 
                    new BABYLON.Vector3(-20,10,0), 
                    scene
                );

                //camera.attachControl(canvas, false);

                camera.setTarget(new BABYLON.Vector3(0,0,0));

                camera.speed = speed;

                let w = () => {
                    camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Forward().scale(camera.speed)))
                }
                let a = () => {
                    camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Left().scale(camera.speed)))
                }
                let s = () => {
                    camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Backward().scale(camera.speed)))
                }
                let d = () => {
                    camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Right().scale(camera.speed)))
                }
                let ctrl = () => {
                    camera.position.addInPlace(BABYLON.Vector3.Down().scale(camera.speed))
                }
                let space = () => {
                    camera.position.addInPlace(BABYLON.Vector3.Up().scale(camera.speed))
                }
                
                let wobserver, aobserver, sobserver, dobserver, ctrlobserver, spaceobserver;
                //need to set custom controls
                canvas.addEventListener('keydown', (ev:any) => { //these key events are proxied from main thread
                    if(ev.keyCode === 87 || ev.keycode === 38) {
                        if(!wobserver) wobserver = scene.onBeforeRenderObservable.add(w);
                    }
                    if(ev.keyCode === 65 || ev.keycode === 37) {
                        if(!aobserver) aobserver = scene.onBeforeRenderObservable.add(a);
                    }
                    if(ev.keyCode === 83 || ev.keycode === 40) {
                        if(!sobserver) sobserver = scene.onBeforeRenderObservable.add(s);
                    }
                    if(ev.keyCode === 68 || ev.keycode === 39) {
                        if(!dobserver) dobserver = scene.onBeforeRenderObservable.add(d);
                    }
                    if(ev.keyCode === 17) {
                        if(!ctrlobserver) ctrlobserver = scene.onBeforeRenderObservable.add(ctrl);
                    }
                    if(ev.keyCode === 32) {
                        if(!spaceobserver) spaceobserver = scene.onBeforeRenderObservable.add(space);
                    }
                    //console.log(ev);
                });
               
                canvas.addEventListener('keyup', (ev:any) => {
                    
                    if(ev.keyCode === 87 || ev.keycode === 38) {
                        if(wobserver) {
                            scene.onBeforeRenderObservable.remove(wobserver);
                            wobserver = null;
                        }
                    }
                    if(ev.keyCode === 65 || ev.keycode === 37) {
                        if(aobserver) {
                            scene.onBeforeRenderObservable.remove(aobserver);
                            aobserver = null;
                        }
                    }
                    if(ev.keyCode === 83 || ev.keycode === 40) {
                        if(sobserver) {
                            scene.onBeforeRenderObservable.remove(sobserver);
                            sobserver = null;
                        }
                    }
                    if(ev.keyCode === 68 || ev.keycode === 39) {
                        if(dobserver) {
                            scene.onBeforeRenderObservable.remove(dobserver);
                            dobserver = null;
                        }
                    }
                    if(ev.keyCode === 17) {
                        if(ctrlobserver) {
                            scene.onBeforeRenderObservable.remove(ctrlobserver);
                            ctrlobserver = null;
                        }
                    }
                    if(ev.keyCode === 32) {
                        if(spaceobserver) {
                            scene.onBeforeRenderObservable.remove(spaceobserver);
                            spaceobserver = null;
                        }
                    }
                    //console.log(ev);
                });
                
                let lastMouseMove;

                let mousemove = (ev:any) => {
                    if(lastMouseMove) {
                        let dMouseX = ev.clientX - lastMouseMove.clientX;
                        let dMouseY = ev.clientY - lastMouseMove.clientY;

                        camera.rotation.y += 4*dMouseX/canvas.width; 
                        camera.rotation.x += 4*dMouseY/canvas.height;
                    }
                    lastMouseMove = ev;
                }
                canvas.addEventListener('mousedown', (ev:any) => {
                    canvas.addEventListener('mousemove',mousemove);
                    //console.log(ev);
                });
                canvas.addEventListener('mouseup', (ev:any) => {
                    canvas.removeEventListener('mousemove',mousemove);
                    lastMouseMove = null;
                    //console.log(ev);
                });

                return camera;
            },
            loadBabylonEntity:function (
                settings:PhysicsEntityProps,
                ctx?:string|WorkerCanvas
            ) {
                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') return undefined;

                const scene = ctx.scene as BABYLON.Scene;

                let entity: BABYLON.Mesh | undefined;
                //limited settings rn for simplicity to work with the physics engine
                if(settings.collisionType === 'ball') {
                    if(!settings._id) settings._id = `ball${Math.floor(Math.random()*1000000000000000)}`
                    
                    entity = BABYLON.MeshBuilder.CreateSphere(
                        settings._id,
                        { 
                            diameter:settings.radius ? settings.radius*2 : settings.collisionTypeParams ? settings.collisionTypeParams[0]*2 : 1, 
                            segments: 8 
                        }, 
                        scene
                    )
                } else if (settings.collisionType === 'capsule') {
                    if(!settings._id) settings._id = `capsule${Math.floor(Math.random()*1000000000000000)}`;

                    entity = BABYLON.MeshBuilder.CreateCapsule(
                        settings._id,
                        { 
                            radius:settings.radius ? settings.radius*1 : settings.collisionTypeParams ? settings.collisionTypeParams[0]*1*1 : 1, 
                            height:settings.halfHeight ? settings.halfHeight*2*2 : settings.collisionTypeParams ? settings.collisionTypeParams[1]*2*2 : 2,
                            tessellation:12,
                            capSubdivisions:12,
                            
                        },
                        scene
                    );

                } else if (settings.collisionType === 'cuboid') {
                    if(!settings._id) settings._id = `box${Math.floor(Math.random()*1000000000000000)}`;
                    
                    entity = BABYLON.MeshBuilder.CreateBox(
                        settings._id,
                        settings.dimensions ? settings.dimensions : settings.collisionTypeParams ? {
                            width:settings.collisionTypeParams[0],
                            height:settings.collisionTypeParams[1],
                            depth:settings.collisionTypeParams[2]
                        } : {width:1,height:1,depth:1},
                        scene
                    );
                }

                if(entity) {

                    if(settings.position) {
                        entity.position.x = settings.position.x;
                        entity.position.y = settings.position.y;
                        entity.position.z = settings.position.z;
                    }
    
                    if(settings.rotation) {
                        entity.rotationQuaternion = new BABYLON.Quaternion(
                            settings.rotation.x, 
                            settings.rotation.y,
                            settings.rotation.z,
                            settings.rotation.w
                        );
                    } else entity.rotationQuaternion = new BABYLON.Quaternion();
                
                    entity.receiveShadows = true;

                    if(ctx.shadowGenerator) {
                        (ctx.shadowGenerator as BABYLON.ShadowGenerator).addShadowCaster(entity);
                    }
                
                }
                
                return settings._id;
            },
            updateEntities:function(
                data:{[key:string]:{ 
                    position:{x:number,y:number,z:number}, 
                    rotation:{x:number,y:number,z:number,w:number} 
                }}|number[],
                ctx?:WorkerCanvas|string 
            ) {

                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') return undefined;

                const scene = ctx.scene as BABYLON.Scene;

                if(Array.isArray(data)) { //array buffer
                    let idx = 0;
                    let offset = 7;
                    
                    const entities = ctx.entities as PhysicsEntityProps[];

                    entities.forEach((e,i) => { //array
                        let mesh = scene.getMeshByName(e._id as string) as BABYLON.Mesh;
                        if(mesh) {
                            let j = i*offset;

                            mesh.position.x = data[j];
                            mesh.position.y = data[j+1];
                            mesh.position.z = data[j+2];

                            if(mesh.rotationQuaternion) {
                                mesh.rotationQuaternion._x = data[j+3];
                                mesh.rotationQuaternion._y = data[j+4];
                                mesh.rotationQuaternion._z = data[j+5];
                                mesh.rotationQuaternion._w = data[j+6];
                            }
                        }
                        idx++;
                    })
                }
                else if(typeof data === 'object') { //key-value pairs
                    for(const key in data) {
                        //if(idx === 0) { idx++; continue; }
                        let mesh = scene.getMeshByName(key);
                        //console.log(JSON.stringify(mesh?.rotation),JSON.stringify(data[key].rotation))
                        if(mesh) {
                            mesh.position.x = data[key].position.x;
                            mesh.position.y = data[key].position.y;
                            mesh.position.z = data[key].position.z;

                            if(mesh.rotationQuaternion) {
                                mesh.rotationQuaternion._x = data[key].rotation.x
                                mesh.rotationQuaternion._y = data[key].rotation.y
                                mesh.rotationQuaternion._z = data[key].rotation.z
                                mesh.rotationQuaternion._w = data[key].rotation.w
                            }
                        }
                    }
                }
            },
            createNavMeshData: async (data) => {
                // get message datas
                const recast = await Recast() as any;
                const positions = data[0];
                const offset = data[1];
                const indices = data[2];
                const indicesLength = data[3];
                const parameters = data[4];
            
                // initialize Recast
                //Recast().then((recast) => {
                // build rc config from parameters
                const rc = new recast.rcConfig();
                rc.cs = parameters.cs;
                rc.ch = parameters.ch;
                rc.borderSize = parameters.borderSize ? parameters.borderSize : 0;
                rc.tileSize = parameters.tileSize ? parameters.tileSize : 0;
                rc.walkableSlopeAngle = parameters.walkableSlopeAngle;
                rc.walkableHeight = parameters.walkableHeight;
                rc.walkableClimb = parameters.walkableClimb;
                rc.walkableRadius = parameters.walkableRadius;
                rc.maxEdgeLen = parameters.maxEdgeLen;
                rc.maxSimplificationError = parameters.maxSimplificationError;
                rc.minRegionArea = parameters.minRegionArea;
                rc.mergeRegionArea = parameters.mergeRegionArea;
                rc.maxVertsPerPoly = parameters.maxVertsPerPoly;
                rc.detailSampleDist = parameters.detailSampleDist;
                rc.detailSampleMaxError = parameters.detailSampleMaxError;
            
                // create navmesh and build it from message datas
                const navMesh = new recast.NavMesh();
                navMesh.build(positions, offset, indices, indicesLength, rc);
            
                // get recast uint8array
                const navmeshData = navMesh.getNavmeshData();
                const arrView = new Uint8Array(recast.HEAPU8.buffer, navmeshData.dataPointer, navmeshData.size);
                const ret = new Uint8Array(navmeshData.size);
                ret.set(arrView);
                navMesh.freeNavmeshData(navmeshData);
            
                // job done, returns the result
                return ret;//postMessage(ret);
                //});
            },
            createNavMesh:async function(
                meshesToMerge:BABYLON.Mesh[]|string[], 
                params?:BABYLON.INavMeshParameters,
                debug?:boolean,
                sendDebug?:string, //send the mesh to a port to render the debug?
                useWorker?:string, //custom workerURL?
                ctx?:string|WorkerCanvas
            ) {


                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') return undefined;

                if(!ctx.nav) ctx.nav = new BABYLON.RecastJSPlugin(await Recast()); 
                const nav = ctx.nav as BABYLON.RecastJSPlugin;
                const scene = ctx.scene as BABYLON.Scene;

                if(typeof meshesToMerge[0] === 'string') {
                    meshesToMerge = meshesToMerge.map((o) => { return scene.getMeshById(o); }) as BABYLON.Mesh[]; 
                }

                let merged = BABYLON.Mesh.MergeMeshes(meshesToMerge as BABYLON.Mesh[]);
                
                var navMeshParameters = {
                    cs: 0.2,
                    ch: 0.2,
                    walkableSlopeAngle: 90,
                    walkableHeight: 10.0,
                    walkableClimb: 3,
                    walkableRadius: 1,
                    maxEdgeLen: 12.,
                    maxSimplificationError: 1.3,
                    minRegionArea: 8,
                    mergeRegionArea: 20,
                    maxVertsPerPoly: 6,
                    detailSampleDist: 6,
                    detailSampleMaxError: 1,
                } as BABYLON.INavMeshParameters;

                if(params) Object.assign(navMeshParameters,params);

                const navMeshId = `navmesh${Math.floor(Math.random()*1000000000000000)}`;

                if(!ctx.navMeshes) ctx.navMeshes = {} as any;

                
                //@ts-ignore
                if(!nav._worker) {
                    // use a secondary worker to load the navMeshes
                    const workerUrl = typeof useWorker === 'string' ? useWorker : `${location.origin}/dist/navmeshwkr.js`; //default 

                    let worker = new Worker(workerUrl);
                    //@ts-ignore
                    nav._worker = worker;
                }

                // test the worker
                // worker.addEventListener('onmessage', (msg) => {
                //     console.log('message', msg);
                // });
                //@ts-ignore
                //nav._worker.postMessage('test'); //test

                //library call, didn't work for some reason...
                //nav.setWorkerURL(`${location.origin}/dist/navmesh.worker.js`);


                const withNavMesh = (navMeshData) => {
                    (ctx as WorkerCanvas).navMeshes[navMeshId] = navMeshData;
                    if(typeof navMeshData === 'string' && (ctx as WorkerCanvas).navMeshes) 
                        navMeshData = (ctx as WorkerCanvas).navMeshes[navMeshData];
                    if(typeof navMeshData !== 'object') return undefined;
    
                    if(isTypedArray(navMeshData)) nav.buildFromNavmeshData(navMeshData);

                    //-------------------------
                    //----------debug----------
                    //-------------------------
                    if(debug) {
                        let debugNavMesh = nav.createDebugNavMesh(scene);
                        if(sendDebug) {
                            let data = debugNavMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                            (this.__node.graph.workers[sendDebug] as WorkerInfo)?.run(
                                'createDebugNavMesh', 
                                [data]
                            );
                        } else {
                            this.__node.graph.run('createDebugNavMesh', debugNavMesh);
                        }
                    }
                    //-------------------------
                    //-------------------------
                    //-------------------------
                    return navMeshId; //will live on ctx.navMeshes, returns Id so you can gain the reference on the main thread
                }

                return new Promise((res) => {
                    nav.createNavMesh(
                        [merged as any], 
                        navMeshParameters, 
                        (navMeshData) => {
                            res(withNavMesh(navMeshData)); //will live on ctx.navMeshes, returns Id so you can gain the reference on the main thread
                        }
                    )
                });
            },
            createDebugNavMesh:function(data:Float32Array, ctx?:WorkerCanvas|string) {

                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') return undefined;

                const scene = ctx.scene;


                let navmeshdebug = new BABYLON.Mesh('navDebugMesh', scene);
                navmeshdebug.setVerticesData(BABYLON.VertexBuffer.PositionKind, data);

                navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
                let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
                matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
                matdebug.alpha = 0.2;
                navmeshdebug.material = matdebug;

            },
            createCrowd:async function (
                entities:BABYLON.Mesh[]|string[],
                initialTarget?:BABYLON.Mesh|string,
                physicsPort?:string,
                params?:Partial<BABYLON.IAgentParameters>,
                ctx?:string|WorkerCanvas
            ) {
                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') return undefined;

                const nav = ctx.nav as BABYLON.RecastJSPlugin;
                const engine = ctx.engine as BABYLON.Engine;
                const scene = ctx.scene as BABYLON.Scene;

                if(typeof entities[0] === 'string') {
                    entities = entities.map((o) => { 
                        return scene.getMeshById(o); 
                    }) as BABYLON.Mesh[]; 
                }

                if(typeof initialTarget === 'string') 
                    initialTarget = scene.getMeshById(initialTarget) as BABYLON.Mesh;

                let crowd = nav.createCrowd(entities.length, 0.1, scene);

                let crowdId = `crowd${Math.floor(Math.random()*1000000000000000)}`;

                if(!ctx.crowds) 
                    ctx.crowds = {};
                
                ctx.crowds[crowdId] = {crowd, target:initialTarget, entities};

                let agentParams = {
                    radius: 0.1,
                    height: 0.2,
                    maxAcceleration: 4.0,
                    maxSpeed: 1.0,
                    collisionQueryRange: 0.5,
                    pathOptimizationRange: 0.1,
                    separationWeight: 1.0
                } as BABYLON.IAgentParameters;

                if(params) Object.assign(agentParams,params);

                entities.forEach((entity) => {
                    let transform = new BABYLON.TransformNode(`${entity.id}TransformNode`, scene);
                    crowd.addAgent(nav.getClosestPoint(entity.position), agentParams, transform);
                })

                if(initialTarget) {
                    let point = nav.getClosestPoint(initialTarget.position);
                    entities.forEach((e, i) => {
                        crowd.agentGoto(i, point); 
                    });
                }

                let tick = 0;

                (ctx as WorkerCanvas).crowds[crowdId].animating = true;
                let obsv = () => {//scene.onBeforeRenderObservable.add(() => {
                    let updates = this.__node.graph.run(
                        'animateCrowd',
                        nav,
                        (ctx as WorkerCanvas).crowds[crowdId].crowd,
                        (ctx as WorkerCanvas).crowds[crowdId].entities,
                        tick,
                        engine.getFps(),
                        (ctx as WorkerCanvas).crowds[crowdId].target
                    );
                    tick++;
                    //console.log(updates);
                    if(physicsPort) {
                        this.__node.graph.workers[physicsPort]?.run('updatePhysicsEntities', updates);
                    }
                    
                    if((ctx as WorkerCanvas).crowds[crowdId].animating)
                        requestAnimationFrame(obsv);
                };//);
                
                requestAnimationFrame(obsv);

                return crowdId;

            },
            removeEntity:function (
                id:string,
                ctx?:string|WorkerCanvas
            ) {

                if(!ctx || typeof ctx === 'string')
                    ctx = this.__node.graph.run('getCanvas',ctx);

                if(typeof ctx !== 'object') return undefined;

                const nav = ctx.nav as BABYLON.RecastJSPlugin;
                const engine = ctx.engine as BABYLON.Engine;
                const scene = ctx.scene as BABYLON.Scene;


                let mesh = scene.getMeshByName(id)
                if(mesh) scene.removeMesh(mesh);
                return mesh !== undefined;
            },
            animateCrowd:function(
                nav:BABYLON.RecastJSPlugin,
                crowd:BABYLON.ICrowd,
                entities:BABYLON.Mesh[],
                tick:number,
                fps:number,
                target?:BABYLON.Mesh,
            ) {

                if(tick % fps === 0) {
                    
                    entities.forEach((e,i) => { //update the crowd positions based on the physics engine's updates to the meshes
                        crowd.agentTeleport(i, e.position);
                    });

                    if(target) {
                        let point = nav.getClosestPoint(target.position);
                        entities.forEach((e, i) => {crowd.agentGoto(i, point); });
                    }
                
                }
                
                crowd.update(1/fps);

                let agentUpdates = {};
                entities.forEach((e,i) => {
                    let agentVelocity = crowd.getAgentVelocity(0);

                    let _fps = 1/fps;
                    let acceleration = {
                        x:agentVelocity.x*_fps*2, 
                        y:agentVelocity.y*_fps*2,
                        z:agentVelocity.z*_fps*2
                    };
    
                    agentUpdates[e.id] = {acceleration};
                })

                return agentUpdates;
                //this.__node.graph.workers[portId]?.run('updatePhysicsEntity', [entity.id,agentUpdates[entity.id]]);
            },
        }
    });


}


export default self as any;