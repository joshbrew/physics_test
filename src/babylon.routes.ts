import {
    workerCanvasRoutes, 
    remoteGraphRoutes, 
    CanvasProps, 
    WorkerCanvas, 
    isTypedArray, 
    WorkerInfo
} from 'graphscript'

import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps } from '../src/types';

import Recast from  "recast-detour"

declare var WorkerGlobalScope;

export const babylonRoutes = {
    ...workerCanvasRoutes,
    ...remoteGraphRoutes,
    receiveBabylonCanvas:function(
        options:CanvasProps
    ) {

        const BabylonCanvasProps = {
            BABYLON,
            init:function (self:WorkerCanvas,canvas,context) {
        
                if(typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
                    //this is a hack
                    globalThis.document.addEventListener = (...args:any[]) => {
                        canvas.addEventListener(...args);
                    }
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
                this.__node.graph.run('updateBabylonEntities', data);

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
    updateBabylonEntities:function(
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

        return data; //echo for chaining threads
    },
    removeBabylonEntity:function (
        id:string,
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        // const nav = ctx.nav as BABYLON.RecastJSPlugin;
        // const engine = ctx.engine as BABYLON.Engine;
        const scene = ctx.scene as BABYLON.Scene;

        if(ctx.entities[id].crowdId) {
            ctx.crowds[ctx.entities[id].crowdId].entities.find((o,i) => { 
                if(o.id === id) {
                    ((ctx as any).crowds[(ctx as any).entities[id].crowdId].crowd as BABYLON.ICrowd).removeAgent(i);
                    (ctx as any).crowds[(ctx as any).entities[id].crowdId].entities.splice(i,1);
                    return true;
                } 
            });
        }
        if(ctx.entities[id].navMesh && ctx.navMesh) {
            ctx.navMesh.meshesToMerge.find((o,i) => {
                if(o.id === id) {
                    ((ctx as any).navMesh.meshesToMerge as BABYLON.Mesh[]).splice(i,1);
                    this.__node.graph.run(
                        'createNavMesh',  
                        (ctx as any).navMesh.meshesToMerge,  
                        (ctx as any).navMesh.navMeshParameters, 
                        (ctx as any).navMesh.debug,
                        (ctx as any).navMesh.sendDebug,
                        undefined,
                        (ctx as any)._id
                    );
                }
            })
        }

        let mesh = scene.getMeshByName(id)
        if(mesh) scene.removeMesh(mesh);

        return id; //echo id for physics and nav threads to remove to remove by subscribing
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
        const scene = ctx.scene as BABYLON.Scene;

        if(typeof meshesToMerge[0] === 'string') {
            meshesToMerge = meshesToMerge.map((o) => { return scene.getMeshById(o); }) as BABYLON.Mesh[]; 
        }

        return this.__node.graph.run(
            'setNavMeshData', 
            meshesToMerge, 
            params, 
            debug, 
            sendDebug, 
            useWorker, 
            ctx
        );

    },
    setNavMeshData:function(
        meshesToMerge: BABYLON.Mesh[],
        params?:BABYLON.INavMeshParameters,
        debug?:boolean,
        sendDebug?:string, //send the mesh to a port to render the debug?
        useWorker?:string, //custom workerURL?
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const nav = ctx.nav as BABYLON.RecastJSPlugin;
        const scene = ctx.scene as BABYLON.Scene;

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

        let merged = BABYLON.Mesh.MergeMeshes(meshesToMerge as BABYLON.Mesh[], false);

        //@ts-ignore
        if(!nav._worker) {
            // use a secondary worker to load the navMeshes
            const workerUrl = typeof useWorker === 'string' ? useWorker : `${location.origin}/dist/navmeshwkr.js`; //default 

            let worker = new Worker(workerUrl);
            //@ts-ignore
            nav._worker = worker;
        }

        const withNavMesh = (navMeshData:Uint8Array) => {
            //console.log(navMeshData);
            (ctx as WorkerCanvas).navMesh = {
                navMeshData, 
                merged, 
                meshesToMerge, 
                navMeshParameters, 
                debug, 
                sendDebug
            };
            
            nav.buildFromNavmeshData(navMeshData);

            //-------------------------
            //----------debug----------
            //-------------------------
            if(debug) {
                let debugNavMesh = nav.createDebugNavMesh(scene);
                if(sendDebug) {
                    let data = debugNavMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                    (this.__node.graph.workers[sendDebug] as WorkerInfo)?.run(
                        'createDebugNavMesh', 
                        [data, (ctx as WorkerCanvas)._id]
                    );
                } else {
                    this.__node.graph.run('createDebugNavMesh', debugNavMesh);
                }
            }
            //-------------------------
            //-------------------------
            //-------------------------
            return true; //will live on ctx.navMesh
        }

        return new Promise((res) => {
            nav.createNavMesh(
                [merged as any], 
                navMeshParameters, 
                (navMeshData) => {
                    let created = withNavMesh(navMeshData);
                    res(created); //will live on ctx.navMesh
                }
            )
        });
    },
    addToNavMesh:function(meshes:BABYLON.Mesh[]|string[], ctx?:string|WorkerCanvas) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

        if(ctx.navMesh) {
            if(typeof meshes[0] === 'string') {
                meshes = meshes.map((o) => { return scene.getMeshById(o); }) as BABYLON.Mesh[]; 
            }

            this.__node.graph.run(
                'setNavMeshData', 
                [...meshes, ctx.navMesh.merged], 
                ctx.navMesh.navMeshParameters, 
                ctx.navMesh.debug, 
                ctx.navMesh.sendDebug
            );
        }

    },
    createDebugNavMesh:function(data:Float32Array, ctx?:WorkerCanvas|string) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene;


        let navmeshdebug = new BABYLON.Mesh('navDebugMesh', scene);
        
        navmeshdebug.setVerticesData(BABYLON.VertexBuffer.PositionKind, data);

        //console.log(navmeshdebug);

        navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
        let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
        matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
        matdebug.alpha = 0.2;
        navmeshdebug.material = matdebug;

    },
    createCrowd:async function (
        entities:BABYLON.Mesh[]|string[],
        initialTarget?:BABYLON.Mesh|string,
        params?:Partial<BABYLON.IAgentParameters>,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const nav = ctx.nav as BABYLON.RecastJSPlugin;
        const engine = ctx.engine as BABYLON.Engine;
        const scene = ctx.scene as BABYLON.Scene;

        let crowdId = `crowd${Math.floor(Math.random()*1000000000000000)}`;

        if(typeof entities[0] === 'string') {
            entities = entities.map((o) => { 
                return scene.getMeshById(o); 
            }) as BABYLON.Mesh[]; 
        }

        for(const e of entities) {
            (e as any).crowdId = crowdId;
        }

        let crowd = nav.createCrowd(entities.length, 10, scene);

        if(!ctx.crowds) 
            ctx.crowds = {};

        if(typeof initialTarget === 'string') 
            initialTarget = scene.getMeshById(initialTarget) as BABYLON.Mesh;
            
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

        if(params) Object.assign(agentParams, params);

        entities.forEach((entity) => {
            let transform = new BABYLON.TransformNode(`${entity.id}TransformNode`, scene);
            let point = nav.getClosestPoint(entity.position);
            crowd.addAgent(point, agentParams, transform);
        })

        if(typeof initialTarget === 'object') {
            let point = nav.getClosestPoint(initialTarget.position as BABYLON.Vector3);
            crowd.getAgents().forEach((i) => {
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
                (ctx as WorkerCanvas).crowds[crowdId].target.position
            );
            tick++;
            //console.log(updates);
            // if(physicsPort) {
            //     this.__node.graph.workers[physicsPort]?.run('updatePhysicsEntities', updates);
            // }
            
            if((ctx as WorkerCanvas).crowds[crowdId].animating)
                requestAnimationFrame(obsv);
        };//);
        
        requestAnimationFrame(obsv);

        return crowdId;

    },
    addCrowdAgent:function (
        entity:string|BABYLON.Mesh,
        crowdId:string,
        params?:Partial<BABYLON.IAgentParameters>,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

        if(ctx.crowds?.[crowdId]) {
            const crowd = ctx.crowds?.[crowdId].crowd as BABYLON.ICrowd;
            if(typeof entity === 'string') {
                entity = scene.getMeshById(entity) as BABYLON.Mesh;
            }

            let agentParams = {
                radius: 0.1,
                height: 0.2,
                maxAcceleration: 4.0,
                maxSpeed: 1.0,
                collisionQueryRange: 0.5,
                pathOptimizationRange: 0.1,
                separationWeight: 1.0
            } as BABYLON.IAgentParameters;
    
            if(params) Object.assign(agentParams, params);

            if(typeof entity === 'object') {
                let transform = new BABYLON.TransformNode(`${entity.id}TransformNode`, scene);
                let idx = crowd.addAgent(entity.position, agentParams, transform);

                if(ctx.crowds?.[crowdId].target)
                    crowd.agentGoto(idx,ctx.crowds?.[crowdId].target);

                return entity.id;
            }
        }
    },
    setCrowdTarget:function (
        target:string|BABYLON.Mesh|BABYLON.Vector3,
        crowdId:string,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;
        const nav = ctx.nav as BABYLON.RecastJSPlugin;

        if(ctx.crowds?.[crowdId]) {

            const crowd = ctx.crowds?.[crowdId].crowd as BABYLON.ICrowd;

            if(typeof target === 'string') 
                target = scene.getMeshById(target) as BABYLON.Mesh;

            if(typeof target === 'object') {

                if((target as BABYLON.Mesh)?.position) 
                target = (target as BABYLON.Mesh).position as BABYLON.Vector3;

                let point = nav.getClosestPoint(target as BABYLON.Vector3);

                ctx.crowds[crowdId].target = target;

                crowd.getAgents().forEach((i) => { crowd.agentGoto(i, point); });

            }
        }
    },
    animateCrowd:function( //internal use function, with subscribable outputs on the graph
        nav:BABYLON.RecastJSPlugin,
        crowd:BABYLON.ICrowd,
        entities:BABYLON.Mesh[],
        tick:number,
        fps:number,
        target?:BABYLON.Vector3,
    ) {

        let needsUpdate = tick % Math.floor(fps*.3) === 0;

        if(needsUpdate) {
            
            entities.forEach((e,i) => { //update the crowd positions based on the physics engine's updates to the meshes
                crowd.agentTeleport(i, e.position);
            });

            if(target) {
                let point = nav.getClosestPoint(target);
                entities.forEach((e, i) => {crowd.agentGoto(i, point); });
            }
        
        }
        
        crowd.update(1/fps);

        let agentUpdates = {};
        entities.forEach((e,i) => {
            let agentVelocity = crowd.getAgentVelocity(i);
            //let path = crowd.getAgentNextTargetPath(i)

            //todo: enable specific parameters to update accelerations
            let _fps = 1/fps;
            let acceleration = {
                x:agentVelocity.x*_fps*2, 
                y:agentVelocity.y*_fps*2,
                z:agentVelocity.z*_fps*2
            };

            // if(needsUpdate) { //provides a stronger direction change impulse
            //     acceleration.x += agentVelocity.x;
            //     acceleration.y += agentVelocity.y;
            //     acceleration.z += agentVelocity.z;
            // }

            agentUpdates[e.id] = {acceleration};
        })

        return agentUpdates;
        //this.__node.graph.workers[portId]?.post('updatePhysicsEntity', [entity.id,agentUpdates[entity.id]]);
    },
}