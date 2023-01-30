import {
    workerCanvasRoutes, 
    remoteGraphRoutes, 
    CanvasProps, 
    WorkerCanvas, 
    isTypedArray, 
    WorkerInfo,
    WorkerService,
} from 'graphscript'

import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps, Vec3 } from '../src/types';

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

                self.camera = this.__node.graph.run('attachFreeCamera', self);

                const cameraControls = this.__node.graph.run('addCameraControls', 0.5, self); //default camera controls
                self.controls = cameraControls;

                canvas.addEventListener('resize', () => { 
                    engine.setSize(canvas.clientWidth,canvas.clientHeight); //manual resize
                });

                //update internal scene info
                canvas.addEventListener('mousemove', (ev) => {
                    scene.pointerX = ev.clientX;
                    scene.pointerY = ev.clientY;
                });

                //scene picking
                canvas.addEventListener('mousedown', (ev) => {
                    let picked = scene.pick(scene.pointerX, scene.pointerY);

                    if(picked.pickedMesh?.name === 'capsule1' && self.controls?.mode !== 'player') {
                        if(self.controls) this.__node.graph.run('removeControls', self.controls, self);
                        self.controls = this.__node.graph.run('addPlayerControls', 'capsule1', self.physicsPort, 2, true)
                        //console.log(picked.pickedMesh);
                    } 
                    else if(!self.controls) {
                        self.controls = this.__node.graph.run('addCameraControls', self);
                    }
                        
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
    //can also use physics thread to sphere cast/get intersections
    rayCast: function (
        origin:BABYLON.Vector3, 
        direction:BABYLON.Vector3, 
        length?:number, 
        filter?:(mesh:BABYLON.AbstractMesh)=>boolean, 
        scene?:BABYLON.Scene, 
        ctx?:string|WorkerCanvas
    ) {
        //attach user to object and add controls for moving the object around
        if(!scene) {
            if(!ctx || typeof ctx === 'string')
                ctx = this.__node.graph.run('getCanvas',ctx);
    
            if(typeof ctx !== 'object') return undefined;

            scene = ctx.scene;

        }

        return scene?.pickWithRay(new BABYLON.Ray(origin,direction,length), filter);
    },
    addPlayerControls:function(
        meshId:string,
        physicsPort:string,
        maxSpeed:number=0.5,
        globalDirection?:boolean,
        ctx?:string|WorkerCanvas
    ) {
        //attach user to object and add controls for moving the object around
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;
        const canvas = ctx.canvas as HTMLCanvasElement;
        const physics = (this.__node.graph as WorkerService).workers[physicsPort];

        if(!physics) return undefined;

        let mesh = scene.getMeshById(meshId) as BABYLON.Mesh;
        if(!mesh) return undefined;

        let velocity = new BABYLON.Vector3(0,0,0);

        let rotdefault = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), 0); //let's align the mesh so it stands vertical
        
        let bb = mesh.getBoundingInfo().boundingBox;
        mesh.position.y = mesh.position.y - bb.vectors[0].z*0.5; //offset mesh position to account for new fixed z rotation

        //attach the camera to the mesh
        const camera = ctx.camera as BABYLON.FreeCamera;
        let cameraobs: BABYLON.Observer<BABYLON.Scene>;
        if(camera) {

            camera.position = mesh.position.add(new BABYLON.Vector3(0, 40, -3));
            camera.rotation = new BABYLON.Vector3(0, 0, Math.PI);
            
            camera.setTarget(mesh.position);

            let obs = scene.onBeforeRenderObservable.add(() => {
                camera.position = mesh.position.add(new BABYLON.Vector3(0, 40, -3));
            });

            cameraobs = obs as BABYLON.Observer<BABYLON.Scene>;
        }
        
        physics.post('updatePhysicsEntity', [
            meshId, { 
                position: { x:mesh.position.x, y:mesh.position.y, z:mesh.position.z },
                rotation:{ x:rotdefault.x, y:rotdefault.y, z:rotdefault.z, w:rotdefault.w},
                restitution:0.1,
                friction:1,
                angularDamping:10000 //prevent rotation by the physics engine (player-controlled instead)
            } as PhysicsEntityProps]
        );

        //various controls
        let forward = () => {
            let v = globalDirection ? BABYLON.Vector3.Forward() : mesh.getDirection(BABYLON.Vector3.Forward());
            velocity.normalize().addInPlace(v).normalize().scaleInPlace(maxSpeed);
            physics.post('updatePhysicsEntity', [meshId, { velocity:{ x:velocity.x, z:velocity.z} }])
        };
        let backward = () => {
            let v = globalDirection ? BABYLON.Vector3.Backward() : mesh.getDirection(BABYLON.Vector3.Backward());
            velocity.normalize().addInPlace(v).normalize().scaleInPlace(maxSpeed);
            physics.post('updatePhysicsEntity', [meshId, { velocity:{ x:velocity.x, z:velocity.z} }])
        };
        let left = () => {
            let v = globalDirection ? BABYLON.Vector3.Left() : mesh.getDirection(BABYLON.Vector3.Left());
            velocity.normalize().addInPlace(v).normalize().scaleInPlace(maxSpeed);
            physics.post('updatePhysicsEntity', [meshId, { velocity:{ x:velocity.x, z:velocity.z} }])
        };
        let right = () => {
            let v = globalDirection ? BABYLON.Vector3.Right() : mesh.getDirection(BABYLON.Vector3.Right());
            velocity.normalize().addInPlace(v).normalize().scaleInPlace(maxSpeed);
            physics.post('updatePhysicsEntity', [meshId, { velocity:{ x:velocity.x, z:velocity.z} }])
        };

        let jumped = false;
        let jump = () => {
            
            if(!jumped) {

                let pick = () => {
                    let direction = BABYLON.Vector3.Down();
                    let picked = scene.pickWithRay(new BABYLON.Ray(mesh.position, direction), (m) => { if(m.id === mesh.id) return false; else return true;});
                   
                    return picked;
                }

                let p = pick();
                if(p) {
                    let boundingBox = mesh.getBoundingInfo().boundingBox;
                    if(p.distance <= -boundingBox.vectors[0].y) {
                        let v = BABYLON.Vector3.Up();
                        jumped = true;
                        velocity.addInPlace(v.scaleInPlace(maxSpeed));
                        physics.post('updatePhysicsEntity', [meshId, { velocity:{ y:velocity.y} }]);
                        
                        let jumping = () => {
                            let picked = pick();
                            if(picked) {
                                if(picked.distance <= -boundingBox.vectors[0].y) {
                                    jumped = false; //can jump again
                                    return;
                                }
                            }
                            setTimeout(jumping, 50); //keep checking if we can jump again
                        }
                        jumping();
                    }
                }
            }
        };

        let oldMaxSpeed = maxSpeed;
        let run = () => { maxSpeed = oldMaxSpeed*2; };
        let walk = () => { maxSpeed = oldMaxSpeed*0.5; };
        let normalSpeed = () => { maxSpeed = oldMaxSpeed; }

        //look at point of contact
        let topDownLook = () => {
            let pickResult = scene.pick(scene.pointerX, scene.pointerY);

            if(pickResult.pickedPoint) {
                var diffX = pickResult.pickedPoint.x - mesh.position.x;
                var diffY = pickResult.pickedPoint.z - mesh.position.z;
                let theta = Math.atan2(diffX,diffY);
                let rot = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), theta);
                physics.post('updatePhysicsEntity', [meshId, { rotation:{ x:rot.x, y:rot.y, z:rot.z, w:rot.w} }])
            }
        };
        //let firstPersonLook //look at camera controller

        let aim;
        let shoot;
        let rayOrSphereCastActivate; //activate crowd members in proximity when crossing a ray or sphere cast (i.e. vision)
        let placementMode; //place objects in the scene as navigation obstacles, trigger navmesh rebuilding for agent maneuvering 

        let wobserver, aobserver, sobserver, dobserver, ctrlobserver, spaceobserver, shiftobserver;

        //implement above controls with these event listeners
        let keydownListener = (ev) => {
            if(ev.keyCode === 87 || ev.keycode === 38) {
                if(!wobserver) wobserver = scene.onBeforeRenderObservable.add(forward);
            }
            if(ev.keyCode === 65 || ev.keycode === 37) {
                if(!aobserver) aobserver = scene.onBeforeRenderObservable.add(left);
            }
            if(ev.keyCode === 83 || ev.keycode === 40) {
                if(!sobserver) sobserver = scene.onBeforeRenderObservable.add(backward);
            }
            if(ev.keyCode === 68 || ev.keycode === 39) {
                if(!dobserver) dobserver = scene.onBeforeRenderObservable.add(right);
            }
            if(ev.keyCode === 16) {
                if(!shiftobserver) shiftobserver = scene.onBeforeRenderObservable.add(run);
            }
            if(ev.keyCode === 17) {
                if(!ctrlobserver) ctrlobserver = scene.onBeforeRenderObservable.add(walk);
            }
            if(ev.keyCode === 32) {
                if(!spaceobserver) spaceobserver = scene.onBeforeRenderObservable.add(jump);
            }
        };
        let keyupListener = (ev) => {
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
            if(ev.keyCode === 16) {
                if(shiftobserver) {
                    scene.onBeforeRenderObservable.remove(shiftobserver);
                    normalSpeed();
                    shiftobserver = null;
                }
            }
            if(ev.keyCode === 17) {
                if(ctrlobserver) {
                    scene.onBeforeRenderObservable.remove(ctrlobserver);
                    normalSpeed();
                    ctrlobserver = null;
                }
            }
            if(ev.keyCode === 32) {
                if(spaceobserver) {
                    scene.onBeforeRenderObservable.remove(spaceobserver);
                    spaceobserver = null;
                }
            }
        };
        let mouseupListener = (ev) => {

        };
        let mousedownListener = (ev) => {

        };
        let mousemoveListener = (ev) => {
            topDownLook();
        };

        canvas.addEventListener('keydown', keydownListener);
        canvas.addEventListener('keyup', keyupListener);
        canvas.addEventListener('mousedown', mousedownListener);
        canvas.addEventListener('mouseup', mouseupListener);
        canvas.addEventListener('mousemove', mousemoveListener);

        let __ondisconnected = () => {
            scene.onBeforeRenderObservable.remove(cameraobs);
        }

        return {
            mode:'player',
            keydownListener,
            keyupListener,
            mousedownListener,
            mouseupListener,
            mousemoveListener,
            __ondisconnected
        }; //controls you can pop off the canvas


        // restrict entity updates entirely to the controller
        // if(physicsPort) {
        //     (this.__node.graph.workers[physicsPort] as WorkerInfo).post('updatePhysicsEntity', [meshId, {dynamic:false}]); //set it as a static mesh
        // }

    },
    removeControls:function(
        controls?:any, 
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
        ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        if(!controls)
            controls = ctx.controls as any;

        if(!controls) return undefined;

        const canvas = ctx.canvas as OffscreenCanvas|HTMLCanvasElement;

        if(controls.keydownListener) canvas.removeEventListener('keydown', controls.keydownListener);
        if(controls.keyupListener) canvas.removeEventListener('keyup', controls.keyupListener);
        if(controls.mouseupListener) canvas.removeEventListener('mouseup', controls.mouseupListener);
        if(controls.mousedownListener) canvas.removeEventListener('mousedown', controls.mousedownListener);
        if(controls.mousemoveListener) canvas.removeEventListener('mousemove', controls.mousemoveListener);
        
        //remove any active controls
        if(controls.keyupListener){
            controls.keyupListener({keyCode:87});
            controls.keyupListener({keyCode:65});
            controls.keyupListener({keyCode:83});
            controls.keyupListener({keyCode:68});
            controls.keyupListener({keyCode:16});
            controls.keyupListener({keyCode:17});
            controls.keyupListener({keyCode:32});
        }
        if(controls.mouseupListener) controls.mouseupListener();

        if(controls.__ondisconnected) controls.__ondisconnected();

        ctx.controls = null;

    },
    attachFreeCamera:function (
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

        const camera = new BABYLON.FreeCamera(
            'camera', 
            new BABYLON.Vector3(-20,10,0), 
            scene
        );

        //camera.attachControl(canvas, false);

        camera.setTarget(new BABYLON.Vector3(0,0,0));

        return camera;
    },
    addCameraControls:function(
        speed=0.5,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;
        const canvas = ctx.canvas as OffscreenCanvas|HTMLCanvasElement;
        const camera = ctx.camera as BABYLON.FreeCamera;

        camera.speed = speed;

        if(!camera) return undefined;

        let w = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Forward().scaleInPlace(camera.speed)))
        }
        let a = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Left().scaleInPlace(camera.speed)))
        }
        let s = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Backward().scaleInPlace(camera.speed)))
        }
        let d = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Right().scaleInPlace(camera.speed)))
        }
        let ctrl = () => {
            camera.position.addInPlace(BABYLON.Vector3.Down().scaleInPlace(camera.speed))
        }
        let space = () => {
            camera.position.addInPlace(BABYLON.Vector3.Up().scaleInPlace(camera.speed))
        }

        let wobserver, aobserver, sobserver, dobserver, ctrlobserver, spaceobserver;
        //need to set custom controls
        
        let keydownListener = (ev:any) => { //these key events are proxied from main thread
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
        }
        
        canvas.addEventListener('keydown', keydownListener);
       
        let keyupListener = (ev:any) => {
            
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
        }

        canvas.addEventListener('keyup', keyupListener);
        
        let lastMouseMove;

        let mousemoveListener = (ev:any) => {
            if(lastMouseMove) {
                let dMouseX = ev.clientX - lastMouseMove.clientX;
                let dMouseY = ev.clientY - lastMouseMove.clientY;

                camera.rotation.y += 4*dMouseX/canvas.width; 
                camera.rotation.x += 4*dMouseY/canvas.height;
            }
            lastMouseMove = ev;
        }

        const mousedownListener = (ev:any) => {
            canvas.addEventListener('mousemove',mousemoveListener);
            //console.log(ev);
        }

        const mouseupListener = (ev:any) => {
            canvas.removeEventListener('mousemove',mousemoveListener);
            lastMouseMove = null;
            //console.log(ev);
        }

        canvas.addEventListener('mousedown', mousedownListener);
        canvas.addEventListener('mouseup', mouseupListener);

        return {
            mode:'freecam',
            keydownListener,
            keyupListener,
            mousedownListener,
            mouseupListener,
            mousemoveListener
        }; //controls you can pop off the canvas

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
                scene,
                (ctx as WorkerCanvas).crowds[crowdId].crowd,
                (ctx as WorkerCanvas).crowds[crowdId].entities,
                tick,
                engine.getFps(),
                (ctx as WorkerCanvas).crowds[crowdId].target.position,
                (ctx as WorkerCanvas).crowds[crowdId].target
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
        scene:BABYLON.Scene,
        crowd:BABYLON.ICrowd,
        entities:BABYLON.Mesh[],
        tick:number,
        fps:number,
        target?:BABYLON.Vector3,
        targetMesh?:BABYLON.Mesh
    ) {

        let needsUpdate = tick % Math.floor(fps*.3) === 0;

        if(needsUpdate) {
            
            entities.forEach((e,i) => { //update the crowd positions based on the physics engine's updates to the meshes
                crowd.agentTeleport(i, e.position);
            });

            if(target) {

                let pick = () => {
                    if(!targetMesh) return;
                    let direction = BABYLON.Vector3.Down();
                    let picked = scene.pickWithRay(
                        new BABYLON.Ray(targetMesh.position, direction), 
                        (m) => { if(m.id === targetMesh.id) return false; else return true;}
                    );
                   
                    return picked;
                }

                let point;
                if(targetMesh) {
                    const picked = pick();
                    if(picked?.pickedPoint) {
                        point = nav.getClosestPoint(picked.pickedPoint); //projected point ensures better navmesh solving
                    } else point = nav.getClosestPoint(target);
                }
                else point = nav.getClosestPoint(target);

                entities.forEach((e, i) => {crowd.agentGoto(i, point); });
            }
        
        }
        
        crowd.update(1/fps);

        let agentUpdates = {};


        entities.forEach((e,i) => {
            let path = crowd.getAgentNextTargetPath(i);
            let agentVelocity = path.subtract(e.position).normalize().scaleInPlace(4);
            //let path = crowd.getAgentNextTargetPath(i)

            //braking (wip)
            let dir: BABYLON.Vector3;
            if(e.rotationQuaternion) dir = e.rotationQuaternion?.toEulerAngles();
            else dir = e.rotation;
            

            //todo: enable specific parameters to update accelerations
            let _fps = 1/fps;
            let acceleration = {
                x:(agentVelocity.x - dir.x)*_fps, 
                y:(agentVelocity.y - dir.y)*_fps,
                z:(agentVelocity.z - dir.z)*_fps
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
    addEntity: function (settings:PhysicsEntityProps, ctx?:string|WorkerCanvas) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;
        
        if(!settings._id) settings._id = `entity${Math.floor(Math.random()*1000000000000000)}`; //consistent Ids are necessary to track across threads
    
        this.__node.graph.run('loadBabylonEntity', settings, ctx);

        let physicsWorker = this.__node.graph.workers[ctx.physicsPort];
        let navWorker = this.__node.graph.workers[ctx.navPort];

        if(physicsWorker) {
            (navWorker as WorkerInfo).post('addPhysicsEntity', settings);
        }
        if(navWorker) {
            (navWorker as WorkerInfo).post('loadBabylonEntity', [settings, ctx._id]); //duplicate entities for the crowd navigation thread e.g. to add agents, obstacles, etc.
            if(settings.crowd) {
                (navWorker as WorkerInfo).post('addCrowdAgent', [settings._id, settings.crowd, ctx._id]);
            }
            if(settings.targetOf) {
                (navWorker as WorkerInfo).post('setCrowdTarget', [settings._id, settings.targetOf, ctx._id]);
            }
            if(settings.navMesh) {
                (navWorker as WorkerInfo).post('addToNavMesh', [settings._id, settings.navMesh, ctx._id]);
            }
        }
    }
}