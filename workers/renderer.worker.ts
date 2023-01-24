import { WorkerService, workerCanvasRoutes, remoteGraphRoutes, CanvasProps, WorkerCanvas, isTypedArray } from '../../graphscript/index'//'graphscript'
import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps } from './types';

import Recast from  "recast-detour"

declare var WorkerGlobalScope

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:{
            ...workerCanvasRoutes,
            ...remoteGraphRoutes,
            receiveBabylonCanvas:function(options:CanvasProps) {

                const BabylonCanvasProps = {
                    BABYLON,
                    init:function (self:WorkerCanvas,canvas,context) {
                
                        //this is a hack
                        globalThis.document.addEventListener = (...args:any[]) => {
                            canvas.addEventListener(...args);
                        } 
        
                        const engine = new BABYLON.Engine(canvas);
                        const scene = new BABYLON.Scene(engine);

                        canvas.addEventListener('resize', () => { 
                            engine.setSize(canvas.clientWidth,canvas.clientHeight); //manual resize
                        });

                        setTimeout(() => { engine.setSize(canvas.clientWidth,canvas.clientHeight);  });
        
                        const light = new BABYLON.SpotLight(
                            'light1', 
                            new BABYLON.Vector3(0,30,0),
                            new BABYLON.Vector3(0,-1,0),
                            1,
                            2,
                            scene
                        )
                        const shadowGenerator = new BABYLON.ShadowGenerator(1024,light);

                        let entityNames = [] as any;
        
                       
        
                        self.engine = engine;
                        self.scene = scene;

                        self.camera = this.__node.graph.run('attachCamera', scene, canvas);

                        self.shadowGenerator = shadowGenerator;

                        if(self.entities) {
                            let meshes = self.entities.map((e,i) => {
                                let mesh = self.graph.run('loadBabylonEntity', self, scene, e); 
                                entityNames[i] = e._id;
                                return mesh;
                            }) as BABYLON.Mesh[];

                            try{
                                const initRecast = async () => {
                                    const nav = new BABYLON.RecastJSPlugin(await Recast()); //https://playground.babylonjs.com/#TN7KNN#2
                                    (globalThis as any).window = {
                                        Worker,
                                        addEventListener
                                    }; //another hack
    

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
                                
                                    let filtered = meshes.filter((m,i) => {
                                        if(m.id === 'ground') return true;
                                    });

                                    let merged = BABYLON.Mesh.MergeMeshes(filtered, false);

                                    if(merged) merged.visibility = 0;

                                    let worker = new Worker(`${location.origin}/dist/navmeshwkr.js`);
                                    // worker.addEventListener('onmessage', (msg) => {
                                    //     console.log('message', msg);
                                    // });
                                    //@ts-ignore
                                    //nav._worker.postMessage('test'); //test

                                    //nav.setWorkerURL(`${location.origin}/dist/navmesh.worker.js`);
                                    //@ts-ignore
                                    nav._worker = worker;

                                    const withNavMesh = (navMeshData) => {
                                        console.log("got worker data", navMeshData);
                                        if(isTypedArray(navMeshData)) nav.buildFromNavmeshData(navMeshData);

                                        let navmeshdebug = nav.createDebugNavMesh(scene);
                                        navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
                                        nav.setTimeStep(1/60);

                                        let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
                                        matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
                                        matdebug.alpha = 0.2;
                                        navmeshdebug.material = matdebug;

                                        let crowd = nav.createCrowd(10, 0.1, scene);

                                        let agentParams = {
                                            radius: 0.1,
                                            height: 0.2,
                                            maxAcceleration: 4.0,
                                            maxSpeed: 1.0,
                                            collisionQueryRange: 0.5,
                                            pathOptimizationRange: 0.1,
                                            separationWeight: 1.0
                                        } as BABYLON.IAgentParameters;

                                        let entity = meshes.find((o,i) => { if(o.id === 'ball') return true;  }) as BABYLON.Mesh;
                                        let transform = new BABYLON.TransformNode('ballt',scene);

                                        crowd.addAgent(nav.getClosestPoint(entity.position), agentParams, transform);

                                        let target = meshes.find((o,i) => { if(o.id.includes('capsule')) return true; }) as BABYLON.Mesh;
                                        let point = nav.getClosestPoint(target.position);
                                        
                                        // let pathPoints = nav.computePath(crowd.getAgentPosition(0), point);
                                        // let pathLine = BABYLON.MeshBuilder.CreateDashedLines("ribbon", {points: pathPoints, updatable: true}, scene);

                                        crowd.agentGoto(0, point);
                                            

                                        console.log(crowd);

                                        let tick = 0;
                                        scene.onBeforeRenderObservable.add(() => {
                                            tick++;

                                            if(tick % 10 === 0) {
                                                let point = nav.getClosestPoint(target.position);
                                                
                                                crowd.agentTeleport(0, entity.position);
                                                crowd.agentGoto(0, point);
                                            
                                            }
                                            let fps = engine.getFps();
                                            crowd.update(1/fps);
                                            let agentVelocity = crowd.getAgentVelocity(0);


                                            let agentUpdates = {};

                                            let _fps = 1/fps;
                                            let acceleration = {
                                                x:agentVelocity.x*_fps*2, 
                                                y:agentVelocity.y*_fps*2,
                                                z:agentVelocity.z*_fps*2
                                            };

                                            agentUpdates[entity.id] = {acceleration};

                                            graph.workers[self.portId]?.run('updatePhysicsEntity', [entity.id,agentUpdates[entity.id]]);
                                            
                                            // entity.position.x = agentPosition.x;
                                            // entity.position.y = agentPosition.y + 1;
                                            // entity.position.z = agentPosition.z; 
                                            //console.log(agentPosition);
                                        })
                                    }

                                    nav.createNavMesh(
                                        [merged as any], 
                                        navMeshParameters, 
                                        withNavMesh
                                    );
                                   
                                    // console.log(worker);
    
                                    console.log(nav);
                                }
                                initRecast();
                                //
                            } catch(er) {
                                console.error(er);
                            }
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
                        }}) {

                        let idx = 0;
                        for(const key in data) {
                            //if(idx === 0) { idx++; continue; }
                            let mesh = (self.scene as BABYLON.Scene).getMeshByName(key);
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
                            idx++;
                        }

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
            attachCamera:function (
                scene:BABYLON.Scene, 
                canvas:OffscreenCanvas
            ) {
                const camera = new BABYLON.FreeCamera(
                    'camera', 
                    new BABYLON.Vector3(-20,10,0), 
                    scene
                );

                //camera.attachControl(canvas, false);

                camera.setTarget(new BABYLON.Vector3(0,0,0));

                camera.speed = 0.5;

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
                
                let wobserver, aobserver, sobserver, dobserver;
                //need to set custom controls
                canvas.addEventListener('keydown', (ev:any) => {
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
            loadBabylonEntity:(self,scene:BABYLON.Scene, settings:PhysicsEntityProps) => {
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

                    if(self.shadowGenerator) {
                        (self.shadowGenerator as BABYLON.ShadowGenerator).addShadowCaster(entity);
                    }
                
                }



                return entity;
            },
            createNavMesh: async (data) => {
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
            createNavigationContext:async function(
                nav:BABYLON.RecastJSPlugin, 
                entities:BABYLON.Mesh[], 
                params?:BABYLON.INavMeshParameters
            ) {
                let merged = BABYLON.Mesh.MergeMeshes(entities);
                
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

                return new Promise((res) => {
                    nav.createNavMesh(
                        [merged as any], 
                        navMeshParameters, 
                        (navmeshData) => {
                            res(navmeshData);
                        }
                    )
                });
            },
            createCrowd:async function (
                navMeshData:Uint8Array, 
                nav:BABYLON.RecastJSPlugin, 
                engine:BABYLON.Engine, 
                scene:BABYLON.Scene, 
                entities:BABYLON.Mesh[],
                target:BABYLON.Mesh,
                params?:Partial<BABYLON.IAgentParameters>,
                debug?:boolean
            ) {

                if(isTypedArray(navMeshData)) nav.buildFromNavmeshData(navMeshData);

                //-------------------------
                //----------debug----------
                //-------------------------
                if(debug) {
                    let navmeshdebug = nav.createDebugNavMesh(scene);
                    navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
                    let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
                    matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
                    matdebug.alpha = 0.2;
                    navmeshdebug.material = matdebug;
                }
                //-------------------------
                //-------------------------
                //-------------------------

                let crowd = nav.createCrowd(entities.length, 0.1, scene);

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
                    let transform = new BABYLON.TransformNode('t', scene);
                    crowd.addAgent(nav.getClosestPoint(entity.position), agentParams, transform);
                })

                if(target) {
                    let point = nav.getClosestPoint(target.position);
                    crowd.agentGoto(0, point);
                    let tick = 0;
                    scene.onBeforeRenderObservable.add(() => {
                        this.__node.graph.run('animateCrowd',nav,crowd,entities,target,tick,engine.getFps());
                    });
                }

                return crowd;

            },
            animateCrowd:function(
                nav:BABYLON.RecastJSPlugin,
                crowd:BABYLON.ICrowd,
                entities:BABYLON.Mesh[],
                target:BABYLON.Mesh,
                tick:number,
                fps:number
            ) {

                if(tick % 10 === 0) {
                    let point = nav.getClosestPoint(target.position);
                    
                    entities.forEach((e,i) => {
                        crowd.agentTeleport(i, e.position);
                    })
                    crowd.agentGoto(0, point);
                
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

                return [
                    agentUpdates,
                    tick                    
                ]
                //this.__node.graph.workers[portId]?.run('updatePhysicsEntity', [entity.id,agentUpdates[entity.id]]);
            },
            removeEntity:function (scene:BABYLON.Scene, entity:string) {
                let mesh = scene.getMeshByName(entity)
                if(mesh) scene.removeMesh(mesh);
                return mesh !== undefined;
            }
        }
    });


}


export default self as any;