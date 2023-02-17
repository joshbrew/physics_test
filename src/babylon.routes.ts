import {
    workerCanvasRoutes, 
    remoteGraphRoutes, 
    CanvasProps, 
    WorkerCanvas, 
    isTypedArray, 
    WorkerInfo,
    WorkerService,
    //recursivelyAssign,
} from 'graphscript'

import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps, Vec3 } from '../src/types';

import Recast from  "recast-detour"

declare var WorkerGlobalScope;

type PhysicsMesh = BABYLON.Mesh & { 
    contacts?:string[], 
    dynamic?:boolean | "kinematicP" | "kinematicV" , collisionType?:string, navMesh?:boolean, 
    crowd?:string, agentState?:string|number, patrol?:Vec3[], origin?:Vec3
};

function recursivelyAssign (target,obj) {
    for(const key in obj) {
        if(obj[key]?.constructor.name === 'Object') {
            if(target[key]?.constructor.name === 'Object') 
                recursivelyAssign(target[key], obj[key]);
            else target[key] = recursivelyAssign({},obj[key]); 
        } else {
            target[key] = obj[key];
            //if(typeof target[key] === 'function') target[key] = target[key].bind(this);
        }
    }

    return target;
}

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
                        self.controls = this.__node.graph.run('addPlayerControls', 'capsule1', self.physicsPort, 2, 'topdown', true, self);
                        //console.log(picked.pickedMesh);
                    } 
                    else if(!self.controls) {
                        self.controls = this.__node.graph.run('addCameraControls', 0.5, self);
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
                        let mesh = scene.getMeshById(this.__node.graph.run('addEntity', e, self, true)); 
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
                return this.__node.graph.run('addEntity', e, self, true);
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
        cameraMode:'topdown'|'firstperson'|'thirdperson'='topdown',
        globalDirection:boolean=false,
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

        physics.run('updatePhysicsEntity', [
            meshId, { 
                position: { x:mesh.position.x, y:mesh.position.y, z:mesh.position.z },
                rotation:{ x:rotdefault.x, y:rotdefault.y, z:rotdefault.z, w:rotdefault.w},
                restitution:0.1,
                mass:100,
                //friction:0.2,
                angularDamping:10000 //prevent rotation by the physics engine (player-controlled instead)
            } as PhysicsEntityProps]
        );

        let cameraobs: BABYLON.Observer<BABYLON.Scene>;
        if(camera) {
            
            if(cameraMode === 'topdown') {
                camera.position = mesh.position.add(new BABYLON.Vector3(0, 20, -8));
                camera.rotation.set(0,0,Math.PI);
                camera.setTarget(mesh.position);
            }
            else if(cameraMode === 'firstperson') {
                camera.position = mesh.position//.add(new BABYLON.Vector3(0, 1, 0));
                let rot = rotdefault.toEulerAngles();
                camera.rotation.set(rot.x,1,rot.z);
            }   
            else if (cameraMode === 'thirdperson') {
                camera.position = mesh.position.subtract(mesh.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(4).subtract(mesh.getDirection(BABYLON.Vector3.Left()).scaleInPlace(1.5)));
                camera.position.y += 2.5;
                let rot = rotdefault.toEulerAngles();
                camera.rotation.set(rot.x,1,rot.z);
            }

            let obs = scene.onBeforeRenderObservable.add(() => {
                if(cameraMode === 'topdown') 
                    camera.position = mesh.position.add(new BABYLON.Vector3(0, 20, -8));
                else if (cameraMode === 'firstperson') 
                    camera.position = mesh.position//.add(new BABYLON.Vector3(0, 1, 0));
                else if(cameraMode === 'thirdperson') {
                    camera.position = mesh.position.subtract(mesh.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(4).subtract(mesh.getDirection(BABYLON.Vector3.Left()).scaleInPlace(1.5)));
                    camera.position.y += 2.5;
                }
            });

            cameraobs = obs as BABYLON.Observer<BABYLON.Scene>;
         
        }

        let swapCameras = () => {
            if(cameraMode === 'topdown')
                cameraMode = 'firstperson';
            else if (cameraMode === 'firstperson')
                cameraMode = 'thirdperson';
            else if (cameraMode === 'thirdperson') {
                cameraMode = 'topdown';
                camera.rotation.set(0,0,Math.PI);
                camera.setTarget(mesh.position);
            }
        }

        let cleanupControls = () => {
            if(typeof ctx === 'object') {
                if(cameraobs) scene.onBeforeRenderObservable.remove(cameraobs);
                this.__node.graph.run('removeControls', ctx.controls, ctx);
                ctx.controls = this.__node.graph.run('addCameraControls', 0.5, ctx);
            }   
        }

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
                            requestAnimationFrame(jumping); //keep checking if we can jump again
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
        let topDownLook = (ev) => {
            let pickResult = scene.pick(ev.clientX, ev.clientY);

            if(pickResult.pickedPoint) {
                var diffX = pickResult.pickedPoint.x - mesh.position.x;
                var diffY = pickResult.pickedPoint.z - mesh.position.z;
                let theta = Math.atan2(diffX,diffY);
                let rot = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), theta);
                physics.post('updatePhysicsEntity', [meshId, { rotation:{ x:rot.x, y:rot.y, z:rot.z, w:rot.w} }])
            }
        };
        //let firstPersonLook //look at camera controller

        let mode = 0; //0 shoot, 1 placement

        let sensitivity = 4;
        let fpsLook = (ev) => {
                let dMouseX = ev.movementX;
                let dMouseY = ev.movementY;

                camera.rotation.y += sensitivity*dMouseX/canvas.width; 
                camera.rotation.x += sensitivity*dMouseY/canvas.height;

                let direction = camera.getDirection(BABYLON.Vector3.Forward());
                direction.y = 1;
                let theta = Math.atan2(direction.x,direction.z);

                let rot = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), theta);
                physics.post('updatePhysicsEntity', [meshId, { rotation:{ x:rot.x, y:rot.y, z:rot.z, w:rot.w} }]);
        }


        let shoot = () => {
            let forward = mesh.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(1.8); //put the shot in front of the mesh
            let impulse = forward.scale(0.05) as any;
            impulse = {x:impulse.x,y:impulse.y,z:impulse.z};

            let settings = {
                _id:`shot${Math.floor(Math.random()*1000000000000000)}`,
                position:{x:mesh.position.x+forward.x,y:mesh.position.y + forward.y,z:mesh.position.z + forward.z},
                collisionType:'ball',
                dynamic:true,
                radius:0.1,
                mass:0.1,
                impulse
            } as PhysicsEntityProps

            this.__node.graph.run('addEntity', settings);

            const bullet = scene.getMeshById(settings._id) as PhysicsMesh;

            let removed = false;
            const removeBullet = (contacting?:string) => {
                removed = true;
                bullet.receiveShadows = false;
                const physicsWorker = (this.__node.graph as WorkerService).workers[(ctx as WorkerCanvas).physicsPort];
                let pulse = {x:impulse.x*100,y:impulse.y*100,z:impulse.z*100};
                if(contacting) physicsWorker.post('updatePhysicsEntity', [contacting, { impulse:pulse }]);
                this.__node.graph.run('removeEntity', settings._id);
                scene.onBeforeRenderObservable.remove(bulletObsv);
            }

            let bulletObsv = scene.onBeforeRenderObservable.add(() => {
                if(bullet.contacts && !removed) { //exists when last frame detected a contact
                    //console.log(bullet.contacts);
                    removeBullet(bullet.contacts[0]);
                }
            });

            setTimeout(() => { if(!removed) removeBullet(); }, 2000);
        };

        let aim = () => {}

        let placing = 'cube';
        let ghostPlaceableId;
        let ghostPlaceable: BABYLON.Mesh | undefined;
        let placed = {}; //record of placements
        let placeable = {
            cube: {
                collisionType:'cuboid',
                dimensions:{height:1, width:1, depth:1},
                mass:10,
                dynamic:true,
                position:{x:0, y:0.5, z:0}
            } as Partial<PhysicsEntityProps>,
            wall: {
                collisionType:'cuboid',
                dimensions:{height:10, width:10, depth:1},
                navMesh:true,
                position:{x:0, y:5, z:0}
            } as Partial<PhysicsEntityProps>,
            wall2: {
                collisionType:'cuboid',
                dimensions:{height:10, width:1, depth:10},
                navMesh:true,
                position:{x:0, y:5, z:0}
            } as Partial<PhysicsEntityProps>,
            platform: {
                collisionType:'cuboid',
                dimensions:{width:10,height:1,depth:10},
                navMesh:true,
                position:{x:0, y:5, z:0}
            } as Partial<PhysicsEntityProps>,
        }

        let makePlaceable = (pick:BABYLON.PickingInfo) => {
            let settings = recursivelyAssign({},placeable[placing]);
            if(pick.pickedPoint) {
                settings.position.x += pick.pickedPoint.x;
                settings.position.y += pick.pickedPoint.y;
                settings.position.z += pick.pickedPoint.z;
            }
            settings._id = `placeable${Math.floor(Math.random()*1000000000000000)}`;
            settings.sensor = true;
            delete settings.dynamic;
            delete settings.navMesh;
            delete settings.crowd;
            delete settings.targetOf;

            this.__node.graph.run('addEntity', settings, ctx);
            ghostPlaceableId = settings._id;
            ghostPlaceable = scene.getMeshById(ghostPlaceableId) as BABYLON.Mesh;

            hoverPlacement();
        }

        let removeGhostPlaceable = () => {
            if(ghostPlaceableId)
                this.__node.graph.run('removeEntity', ghostPlaceableId);

            ghostPlaceableId = undefined;
            ghostPlaceable = undefined;
        }

        let hoverPlacement = () => {
            let pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => { 
                if(ghostPlaceable && mesh.id === ghostPlaceableId) return false;
                else return true;  
            });

            if(pick.pickedMesh?.id && placed[pick.pickedMesh.id]) {
                removeGhostPlaceable();
            }
            else if(pick.pickedPoint) {
                if(!ghostPlaceableId) makePlaceable(pick);
                const physicsWorker = (this.__node.graph as WorkerService).workers[(ctx as WorkerCanvas).physicsPort];
                if(ghostPlaceable) {
                    let position = {
                        x:pick.pickedPoint.x + placeable[placing].position.x,
                        y:pick.pickedPoint.y + placeable[placing].position.y,
                        z:pick.pickedPoint.z + placeable[placing].position.z
                    } 
                    physicsWorker.post('updatePhysicsEntity', [
                        ghostPlaceableId, { 
                            position 
                        }
                    ]);

                    ghostPlaceable.position.set(position.x,position.y,position.z); //update manually as it is considered unmoving on the physics thread
                }
            }
        }

        let place = () => {
            let pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => { 
                if(ghostPlaceable && mesh.id === ghostPlaceableId) return false;
                else return true;  
            });
            if(pick.pickedPoint) {
                let settings = recursivelyAssign({}, placeable[placing]);
                if(pick.pickedMesh?.id && placed[pick.pickedMesh.id]) { //remove existing mesh
                    this.__node.graph.run('removeEntity', pick.pickedMesh.id);
                    delete placed[pick.pickedMesh.id];
                }
                else if(pick.pickedPoint && ghostPlaceable) { //place new mesh
                    settings.position.x += pick.pickedPoint.x;
                    settings.position.y += pick.pickedPoint.y;
                    settings.position.z += pick.pickedPoint.z;
                    settings._id = `placeable${Math.floor(Math.random()*1000000000000000)}`;
                    this.__node.graph.run('addEntity', settings, ctx);
                    placed[settings._id] = scene.getMeshById(settings._id) as BABYLON.Mesh;
                    removeGhostPlaceable();
                }
            }
        }

        // let sphereCast = () => {
        //     if((ctx as WorkerCanvas).physicsPort) {
        //         const physicsWorker = this.__node.graph.workers[(ctx as WorkerCanvas).physicsPort];
                
        //         physicsWorker.run('sphereCast', [mesh.position, ])
        //     }
        // }; //activate crowd members in proximity when crossing a ray or sphere cast (i.e. vision)

        let wobserver, aobserver, sobserver, dobserver, ctrlobserver, spaceobserver, shiftobserver;

        //implement above controls with these event listeners
        // TODO: Generalizer this to a keymapping object and just set the functions for the corresponding keys e.g. to allow quick remapping
        let keydownListener = (ev) => {
            let pass;
            if(ev.keyCode === 87 || ev.keycode === 38) { //w or arrow up
                if(!wobserver) wobserver = scene.onBeforeRenderObservable.add(forward);
                pass = true;
            }
            if(ev.keyCode === 65 || ev.keycode === 37) { //a or arrow left
                if(!aobserver) aobserver = scene.onBeforeRenderObservable.add(left);
                pass = true;
            }
            if(ev.keyCode === 83 || ev.keycode === 40) { //s or arrow down
                if(!sobserver) sobserver = scene.onBeforeRenderObservable.add(backward);
                pass = true;
            }
            if(ev.keyCode === 68 || ev.keycode === 39) { //d or arrow right
                if(!dobserver) dobserver = scene.onBeforeRenderObservable.add(right);
                pass = true;
            }
            if(ev.keyCode === 16) { //shift key
                if(!shiftobserver) shiftobserver = scene.onBeforeRenderObservable.add(run);
                pass = true;
            }
            if(ev.keyCode === 17) { //ctrl key
                if(!ctrlobserver) ctrlobserver = scene.onBeforeRenderObservable.add(walk);
                pass = true;
            }
            if(ev.keyCode === 32) { //space key
                if(!spaceobserver) spaceobserver = scene.onBeforeRenderObservable.add(jump);
                pass = true;
            }

            if(ev.keyCode === 9) { //tab
                pass = true;
            }

            if(ev.keyCode === 18) { //alt
                mode = 1;
                pass = true;
                //placement mode
            }

            if(ev.keyCode === 81) { //q
                pass = true;
            }

            if(ev.keyCode === 69) { //e
                pass = true;
            }

            if(ev.keyCode === 70) { //f
                pass = true;
            }

            if(ev.keyCode === 82) { //r
                pass = true;
            }

            if(ev.keyCode === 86) { //v
                pass = true;
            }

            if(ev.keyCode === 67) { //c
                pass = true;
            }

            if(ev.keyCode === 90) { //z 
                pass = true;
            }

            if(ev.keyCode === 88) { //x
                pass = true;
            }

            if(ev.keyCode === 8) { //esc
                pass = true;
            }

            if(ev.keyCode === 27) { //backspace
                pass = true;
            }

            if(pass) {
                if(ev.preventDefault) ev.preventDefault();
            }
        };
        
        let keyupListener = (ev) => {
            let pass;
            if(ev.keyCode === 87 || ev.keycode === 38) {
                if(wobserver) {
                    scene.onBeforeRenderObservable.remove(wobserver);
                    wobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 65 || ev.keycode === 37) {
                if(aobserver) {
                    scene.onBeforeRenderObservable.remove(aobserver);
                    aobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 83 || ev.keycode === 40) {
                if(sobserver) {
                    scene.onBeforeRenderObservable.remove(sobserver);
                    sobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 68 || ev.keycode === 39) {
                if(dobserver) {
                    scene.onBeforeRenderObservable.remove(dobserver);
                    dobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 16) {
                if(shiftobserver) {
                    scene.onBeforeRenderObservable.remove(shiftobserver);
                    normalSpeed();
                    shiftobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 17) {
                if(ctrlobserver) {
                    scene.onBeforeRenderObservable.remove(ctrlobserver);
                    normalSpeed();
                    ctrlobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 32) {
                if(spaceobserver) {
                    scene.onBeforeRenderObservable.remove(spaceobserver);
                    spaceobserver = null;
                }
                pass = true;
            }

            if(ev.keyCode === 81) { //q
                pass = true;

            }

            if(ev.keyCode === 69) { //e
                pass = true;

            }

            if(ev.keyCode === 70) { //f
                pass = true;

            }

            if(ev.keyCode === 82) { //r
                pass = true;

            }

            if(ev.keyCode === 86) { //v
                pass = true;
                
            }

            if(ev.keyCode === 67) { //c
                pass = true;

            }

            if(ev.keyCode === 90) { //z 
                pass = true;
                swapCameras();
            }

            if(ev.keyCode === 88) { //x
                pass = true;
            }

            if(ev.keyCode === 8) {//backspace
                pass = true;
                cleanupControls();
            }

            if(ev.keyCode === 9) { //tab
                pass = true;

            }
            if(ev.keyCode === 16) { //shift
                pass = true;
            }

            if(ev.keyCode === 18) { //alt
                mode = 0; //placement mode
                removeGhostPlaceable();
                pass = true;
            }

            if(ev.keyCode === 8) { //esc
                pass = true;
            }

            if(pass) {
                if(ev.preventDefault) ev.preventDefault();
            }
        };


        let mouseupListener = (ev:MouseEvent) => {
            if(ev.preventDefault) ev.preventDefault();
        };
        let mousedownListener = (ev:MouseEvent) => {
            if(mode === 0) shoot();
            if (mode === 1) place(); 

            if(ev.preventDefault) ev.preventDefault();
        };
        let mousemoveListener = (ev) => {
            if(cameraMode === 'topdown') topDownLook(ev);
            else fpsLook(ev);

            if(mode === 1) {
                hoverPlacement();
            }
        };

        let mousewheelListener = (ev:WheelEvent) => {
            if(mode === 1) {
                if(ev.deltaY) { //scroll the list of placeables 
                    let keys = Object.keys(placeable);
                    let curIdx = keys.indexOf(placing);
                    if(ev.deltaY > 0) {
                        curIdx++;
                        if(curIdx >= keys.length) curIdx = 0;
                        removeGhostPlaceable();
                        placing = keys[curIdx];
                        hoverPlacement();
                    }
                    if(ev.deltaY < 0) {
                        curIdx--;
                        if(curIdx < 0 ) curIdx = keys.length-1;
                        removeGhostPlaceable();
                        placing = keys[curIdx];
                        hoverPlacement();
                    }
                }
            }
        }

        canvas.addEventListener('keydown', keydownListener);
        canvas.addEventListener('keyup', keyupListener);
        canvas.addEventListener('mousedown', mousedownListener);
        canvas.addEventListener('mouseup', mouseupListener);
        canvas.addEventListener('mousemove', mousemoveListener);
        canvas.addEventListener('wheel', mousewheelListener);

        let __ondisconnected = () => {
            if(cameraobs) scene.onBeforeRenderObservable.remove(cameraobs);

            //reset entity properties, could e.g. trigger ragdoll mode 
            physics.post('updatePhysicsEntity', [
                meshId, { 
                    restitution:0.5,
                    //friction:0,
                    angularDamping:0 
                } as PhysicsEntityProps]
            );
        }

        return {
            mode:'player',
            keydownListener,
            keyupListener,
            mousedownListener,
            mouseupListener,
            mousemoveListener,
            mousewheelListener,
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
        if(controls.mousewheelListener) canvas.removeEventListener('wheel', controls.mousewheelListener);
        
        //remove any active controls observers (wasd, ctrl, space, shift)

        requestAnimationFrame(() => { //for whatever reason the controls don't remove right away so this makes sure we don't overlap events on accident
            if(controls.keyupListener){
                controls.keyupListener({keyCode:87});
                controls.keyupListener({keyCode:65});
                controls.keyupListener({keyCode:83});
                controls.keyupListener({keyCode:68});
                controls.keyupListener({keyCode:16});
                controls.keyupListener({keyCode:17});
                controls.keyupListener({keyCode:32});
            }
    
            if(controls.mouseupListener) controls.mouseupListener({});
    
            if(controls.__ondisconnected) controls.__ondisconnected();
    
        })
        
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
            const move = camera.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(camera.speed);
            camera.position.addInPlace(move);
        }
        let a = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Left()).scaleInPlace(camera.speed));
        }
        let s = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Backward()).scaleInPlace(camera.speed));
        }
        let d = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Right()).scaleInPlace(camera.speed));
        }
        let ctrl = () => {
            camera.position.addInPlace(BABYLON.Vector3.Down().scaleInPlace(camera.speed));
        }
        let space = () => {
            camera.position.addInPlace(BABYLON.Vector3.Up().scaleInPlace(camera.speed));
        }

        let wobserver, aobserver, sobserver, dobserver, ctrlobserver, spaceobserver;
        //need to set custom controls
        
        let keydownListener = (ev:any) => { //these key events are proxied from main thread

            let pass;
            if(ev.keyCode === 87 || ev.keycode === 38) {
                if(!wobserver) wobserver = scene.onBeforeRenderObservable.add(w);
                pass = true;
            }
            if(ev.keyCode === 65 || ev.keycode === 37) {
                if(!aobserver) aobserver = scene.onBeforeRenderObservable.add(a);
                pass = true;
            }
            if(ev.keyCode === 83 || ev.keycode === 40) {
                if(!sobserver) sobserver = scene.onBeforeRenderObservable.add(s);
                pass = true;
            }
            if(ev.keyCode === 68 || ev.keycode === 39) {
                if(!dobserver) dobserver = scene.onBeforeRenderObservable.add(d);
                pass = true;
            }
            if(ev.keyCode === 17) {
                if(!ctrlobserver) ctrlobserver = scene.onBeforeRenderObservable.add(ctrl);
                pass = true;
            }
            if(ev.keyCode === 32) {
                if(!spaceobserver) spaceobserver = scene.onBeforeRenderObservable.add(space);
                pass = true;
            }
            //console.log(ev);
            if(pass) ev.preventDefault();
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


    addEntity:function (
        settings:PhysicsEntityProps,
        ctx?:string|WorkerCanvas,
        onInit?:boolean
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        if(settings._id && this.__node.graph.get(settings._id)) return settings._id; //already established

        const scene = ctx.scene as BABYLON.Scene;

        let entity: PhysicsMesh | undefined;
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
        } else if(settings.collisionType === 'cylinder') {
            if(!settings._id) settings._id = `cylinder${Math.floor(Math.random()*1000000000000000)}`;
            entity = BABYLON.MeshBuilder.CreateCylinder(settings._id, { 
                height: settings.dimensions?.height ? settings.dimensions.height : 1, 
                diameter: settings.radius ? settings.radius*2 : 1,
                tessellation: 12
            });
        } else if (settings.collisionType === 'cone') {
            if(!settings._id) settings._id = `cone${Math.floor(Math.random()*1000000000000000)}`;
            entity = BABYLON.MeshBuilder.CreateCylinder(settings._id, { 
                height: settings.dimensions?.height ? settings.dimensions.height : 1, 
                diameter: settings.radius ? settings.radius*2 : 1,
                tessellation: 12,
                diameterTop:0
            });
        } 

        if(entity) {

            entity.dynamic = settings.dynamic;
            entity.crowd = settings.crowd;
            entity.navMesh = settings.navMesh;
            entity.collisionType = settings.collisionType;

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
        
            let node = (this.__node.graph as WorkerService).add(
                {
                    __node:{ tag:settings._id },
                    __ondisconnected:function (node) {
                        if((ctx as WorkerCanvas).entities[(entity as PhysicsMesh).id]) this.__node.graph.run('removeEntity', settings._id, ctx);
                    }
                }
            );

            node.__proxyObject(entity);
            
            if(!ctx.entities) ctx.entities = {};
            ctx.entities[entity.id] = settings;

            //todo: check for redundancy
            if(ctx.physicsPort) {
                const physicsWorker = this.__node.graph.workers[ctx.physicsPort];
                (physicsWorker as WorkerInfo).post('addPhysicsEntity', [settings]);
            }
            if(!onInit) {
                if(ctx.navPort) {
                    const navWorker = this.__node.graph.workers[ctx.navPort];
                    (navWorker as WorkerInfo).post('addEntity', [settings]); //duplicate entities for the crowd navigation thread e.g. to add agents, obstacles, etc.
                    if(settings.crowd) {
                        (navWorker as WorkerInfo).post('addCrowdAgent', [settings._id, settings.crowd, undefined, ctx._id]);
                    }
                    if(settings.targetOf) {
                        (navWorker as WorkerInfo).post('setCrowdTarget', [settings._id, settings.targetOf, ctx._id]);
                    }
                    if(settings.navMesh) {
                        (navWorker as WorkerInfo).post('addToNavMesh', [[settings._id], ctx._id]);
                    }
                }
            }
        }

        return settings._id;
    },
    updateBabylonEntities:function(
        data:{
            buffer:{
                [id:string]:{ 
                    position:{x:number,y:number,z:number}, 
                    rotation:{x:number,y:number,z:number,w:number},
                }
            },
            contacts?:{
                [id:string]:string[]
            } //ids of meshes this body is in contact with
        }|{
            buffer:number[],
            contacts?:{
                [id:string]:string[]
            } //ids of meshes this body is in contact with
        },
        ctx?:WorkerCanvas|string 
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

        if(Array.isArray(data.buffer)) { //array buffer
            let idx = 0;
            let offset = 7;
            
            const entities = ctx.entities as PhysicsEntityProps[];

            entities.forEach((e,i) => { //array
                let mesh = scene.getMeshByName(e._id as string) as PhysicsMesh;
                if(mesh?.dynamic) {
                    let j = i*offset;

                    mesh.position.x = data.buffer[j];
                    mesh.position.y = data.buffer[j+1];
                    mesh.position.z = data.buffer[j+2];

                    if(mesh.rotationQuaternion) {
                        mesh.rotationQuaternion._x = data.buffer[j+3];
                        mesh.rotationQuaternion._y = data.buffer[j+4];
                        mesh.rotationQuaternion._z = data.buffer[j+5];
                        mesh.rotationQuaternion._w = data.buffer[j+6];
                    }

                    if(data.contacts?.[e._id]) {
                        mesh.contacts = data[e._id].contacts;
                    } else if(mesh.contacts) delete mesh.contacts; //delete old contacts on this frame

                    idx++;
                }
            })
        }
        else if(typeof data === 'object') { //key-value pairs
            for(const key in data.buffer) {
                //if(idx === 0) { idx++; continue; }
                let mesh = scene.getMeshByName(key) as PhysicsMesh;
                //console.log(JSON.stringify(mesh?.rotation),JSON.stringify(data[key].rotation))
                if(mesh) {
                    if(data.buffer[key].position) {
                        mesh.position.x = data.buffer[key].position.x;
                        mesh.position.y = data.buffer[key].position.y;
                        mesh.position.z = data.buffer[key].position.z;
                    }
                    if(data.buffer[key].rotation && mesh.rotationQuaternion) {
                        mesh.rotationQuaternion._x = data.buffer[key].rotation.x
                        mesh.rotationQuaternion._y = data.buffer[key].rotation.y
                        mesh.rotationQuaternion._z = data.buffer[key].rotation.z
                        mesh.rotationQuaternion._w = data.buffer[key].rotation.w
                    }

                    if(data.contacts?.[key]) {
                        mesh.contacts = data.contacts[key];
                    } else if(mesh.contacts) delete mesh.contacts; //delete old contacts on this frame
                }
            }
        }

        return data; //echo for chaining threads
    },
    removeEntity:function (
        _id:string,
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        // const nav = ctx.nav as BABYLON.RecastJSPlugin;
        // const engine = ctx.engine as BABYLON.Engine;
        const scene = ctx.scene as BABYLON.Scene;

        let mesh = scene.getMeshByName(_id) as PhysicsMesh;
        if(!mesh) return undefined; //already removed

        if(ctx.crowds) {
            if(mesh.crowd) {
                ctx.crowds[mesh.crowd].entities.find((o,i) => { 
                    if(o.id === _id) {
                        ((ctx as any).crowds[(ctx as any).entities[_id].crowdId].crowd as BABYLON.ICrowd).removeAgent(i);
                        (ctx as any).crowds[(ctx as any).entities[_id].crowdId].entities.splice(i,1);
                        return true;
                    } 
                });
            }
        }
        if(ctx.navMesh) {
            if(mesh.navMesh && ctx.navMesh) {
                ctx.navMesh.meshesToMerge.find((o,i) => {
                    if(o.id === _id) {
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

                        

                        return true;
                    }
                })
            }
        }

        delete ctx.entities[_id];
        (this.__node.graph as WorkerService).remove(_id); //remove if not removed already

        if(ctx.navPort) {
            const navWorker = this.__node.graph.workers[ctx.navPort];
            (navWorker as WorkerInfo).post('removeEntity', mesh.id);
        }

        if(ctx.physicsPort) {
            const physicsWorker = this.__node.graph.workers[ctx.physicsPort];
            (physicsWorker as WorkerInfo).post('removePhysicsEntity', mesh.id);
        }
        
        scene.removeMesh(mesh);
        if(ctx.shadowGenerator) {
            (ctx.shadowGenerator as BABYLON.ShadowGenerator).removeShadowCaster(mesh, true);
        }


        return _id; //echo id for physics and nav threads to remove to remove by subscribing
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
            ctx = this.__node.graph.run('getCanvas', ctx);

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
            ctx = this.__node.graph.run('getCanvas', ctx);

        if(typeof ctx !== 'object') return undefined;

        const nav = ctx.nav as BABYLON.RecastJSPlugin;
        const scene = ctx.scene as BABYLON.Scene;

        var navMeshParameters = {
            cs: 0.2,
            ch: 0.2,
            walkableSlopeAngle: 90,
            walkableHeight: 10.0,
            walkableClimb: 3,
            walkableRadius: 5,
            maxEdgeLen: 12.,
            maxSimplificationError: 1.3,
            minRegionArea: 8,
            mergeRegionArea: 20,
            maxVertsPerPoly: 6,
            detailSampleDist: 6,
            detailSampleMaxError: 1,
        } as BABYLON.INavMeshParameters;

        if(params) Object.assign(navMeshParameters,params);

        let merged = BABYLON.Mesh.MergeMeshes(meshesToMerge as BABYLON.Mesh[], false, true);

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

            //now we need to remake the crowds to account for the new navmesh data
            if((ctx as WorkerCanvas).crowds) {
                for(const key in (ctx as WorkerCanvas).crowds) {
                    this.__node.graph.run(
                        'createCrowd', 
                        (ctx as WorkerCanvas).crowds[key].entities, 
                        (ctx as WorkerCanvas).crowds[key].target, 
                        (ctx as WorkerCanvas).crowds[key].agentParams, 
                        ctx
                    );
                }
            }

            //-------------------------
            //----------debug----------
            //-------------------------
            if(debug) {
                let debugNavMesh = nav.createDebugNavMesh(scene);
                if(sendDebug) {
                    let data = debugNavMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                    let indices = debugNavMesh.getIndices();
                    setTimeout(() => {
                        (this.__node.graph.workers[sendDebug] as WorkerInfo)?.post(
                            'createDebugNavMesh', 
                            [data, indices, (ctx as WorkerCanvas)._id]
                        );
                    }, 100);
                } else {
                    debugNavMesh.position = new BABYLON.Vector3(0, 0.01, 0);
                    let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
                    matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
                    matdebug.alpha = 0.2;
                    debugNavMesh.material = matdebug;
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

            meshes = [...meshes, ...ctx.navMesh.meshesToMerge];

            this.__node.graph.run(
                'setNavMeshData', 
                meshes, 
                ctx.navMesh.navMeshParameters, 
                ctx.navMesh.debug, 
                ctx.navMesh.sendDebug
            );

        } else this.__node.graph.run('setNavMeshData', meshes, ctx);

    },
    removeFromNavMesh:function(mesh:string|BABYLON.Mesh, ctx?:string|WorkerCanvas) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        if(ctx.navMesh) {
            if(typeof mesh === 'object') {
                mesh = mesh.id;
            }

            ctx.navMesh.meshesToMerge.find((o,i) => {
                if(o.id === mesh) {
                    (ctx as WorkerCanvas).navMesh.meshesToMerge.splice(i,1);
                    return true;
                }
            });

            this.__node.graph.run(
                'setNavMeshData', 
                ctx.navMesh.meshesToMerge, 
                ctx.navMesh.navMeshParameters, 
                ctx.navMesh.debug, 
                ctx.navMesh.sendDebug
            );
        }
    },
    createDebugNavMesh:function(data:BABYLON.FloatArray, indices: BABYLON.IndicesArray, ctx?:WorkerCanvas|string) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas', ctx);
        if(typeof ctx !== 'object') return undefined;
        
        const scene = ctx.scene as BABYLON.Scene;

        let navmeshdebug:BABYLON.Mesh;

        if(scene.getMeshById('navDebugMesh')) {
            let existing = scene.getMeshById('navDebugMesh') as BABYLON.AbstractMesh;
            scene.removeMesh(existing);
            scene.removeMaterial(existing.material as BABYLON.Material);
        }

        navmeshdebug = new BABYLON.Mesh('navDebugMesh', scene);

        let vertexData = new BABYLON.VertexData();
        vertexData.positions = data;
        vertexData.indices = indices;
        
        vertexData.applyToMesh(navmeshdebug);

        navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
        let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
        matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
        matdebug.alpha = 0.2;
        navmeshdebug.material = matdebug;

        //console.log(navmeshdebug);

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

        let crowdId;
        if(!ctx.crowds) 
            ctx.crowds = {};

        if(typeof entities[0] === 'string') {
            entities = entities.map((o) => { 
                let mesh = scene.getMeshById(o) as PhysicsMesh;
                return mesh; 
            }) as BABYLON.Mesh[]; 
        }

        for(const e of entities) {
            if(!crowdId) {
                if((e as any).crowd) crowdId = (e as any).crowd;
                else crowdId = `crowd${Math.floor(Math.random()*1000000000000000)}`;
            }
            (e as any).crowd = crowdId;
        }
        
        if(ctx.crowds[crowdId]) { //we are recreating this crowd
            ctx.crowds[crowdId].animating = false; //reset the animation loop
            (ctx.crowds[crowdId].crowd as BABYLON.ICrowd).dispose(); 
            delete ctx.crowds[crowdId];
        }

        let crowd = nav.createCrowd(entities.length, 10, scene);

        if(typeof initialTarget === 'string') 
            initialTarget = scene.getMeshById(initialTarget) as BABYLON.Mesh;
            

        let agentParams = {
            radius: 0.1,
            height: 0.2,
            maxAcceleration: 100.0,
            maxSpeed: 1.0,
            collisionQueryRange: 3,
            pathOptimizationRange: 0.1,
            separationWeight: 1.0
        } as BABYLON.IAgentParameters;

        if(params) Object.assign(agentParams, params);

        let obj = {
            crowd, 
            target:initialTarget, 
            entities, 
            agentParams, 
            animating:true
        };

        ctx.crowds[crowdId] = obj;

        entities.forEach((entity) => {
            if(typeof entity === 'object') {
                if(scene.getTransformNodeById(`${entity.id}TransformNode`)) scene.removeTransformNode(scene.getTransformNodeById(`${entity.id}TransformNode`) as BABYLON.TransformNode);
                let transform = new BABYLON.TransformNode(`${entity.id}TransformNode`, scene);
                let point = nav.getClosestPoint(entity.position);
    
                entity.agentState = 1;
                entity.origin = Object.assign({}, entity.position);
    
                crowd.addAgent(point, agentParams, transform);
            }
        })

        if(typeof initialTarget === 'object') {
            let pick = () => {
                if(!initialTarget) return;
                let direction = BABYLON.Vector3.Down();
                let picked = scene.pickWithRay(
                    new BABYLON.Ray((initialTarget as BABYLON.Mesh).position, direction), 
                    (m) => { if(m.id === (initialTarget as BABYLON.Mesh).id) return false; else return true;}
                );
               
                return picked;
            }

            let point;
            if(initialTarget) {
                const picked = pick();
                if(picked?.pickedPoint) {
                    point = nav.getClosestPoint(picked.pickedPoint); //projected point ensures better navmesh solving
                } else point = nav.getClosestPoint(initialTarget.position);
            }
            crowd.getAgents().forEach((i) => {
                crowd.agentGoto(i, point); 
            });
        }

        let tick = 0;

        let obsv = () => {//scene.onBeforeRenderObservable.add(() => {
            
            if(!obj.animating) return;
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

            let agentParams = {...ctx.crowds[crowdId].agentParams} as BABYLON.IAgentParameters;
    
            if(params) Object.assign(agentParams, params);

            if(typeof entity === 'object') {
                let transform = new BABYLON.TransformNode(`${entity.id}TransformNode`, scene);
                let idx = crowd.addAgent(entity.position, agentParams, transform);

                (entity as PhysicsMesh).agentState = 1; //0: idle/patrol, 1: pursuing target
                ctx.crowds?.[crowdId].entities.push(entity);

                if(ctx.crowds?.[crowdId].target)
                    crowd.agentGoto(idx,ctx.crowds?.[crowdId].target);

                return entity.id;
            }
        }
    },
    removeCrowdAgent:function (meshId:string, ctx?:string|WorkerCanvas) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__node.graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        // const nav = ctx.nav as BABYLON.RecastJSPlugin;
        // const engine = ctx.engine as BABYLON.Engine;
        const scene = ctx.scene as BABYLON.Scene;

        let mesh = scene.getMeshByName(meshId) as PhysicsMesh;
        if(!mesh) return undefined; //already removed

        if(ctx.crowds) {
            if(mesh.crowd) {
                ctx.crowds[mesh.crowd].entities.find((o,i) => { 
                    if(o.id === meshId) {
                        ((ctx as any).crowds[(ctx as any).entities[meshId].crowdId].crowd as BABYLON.ICrowd).removeAgent(i);
                        (ctx as any).crowds[(ctx as any).entities[meshId].crowdId].entities.splice(i,1);
                        return true;
                    } 
                });
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

                entities.forEach((e:PhysicsMesh, i) => {
                    if(e.agentState === 1) crowd.agentGoto(i, point);
                    else if (e.agentState === 0 && e.patrol) {}  
                });
            }
        
        }
        
        crowd.update(1/fps);

        let agentUpdates = {};

        entities.forEach((e,i) => {
            let agentVelocity = crowd.getAgentVelocity(i);
            //let path = crowd.getAgentNextTargetPath(i)
            //todo: enable specific parameters to update accelerations
            let _fps = 4/fps;
            let addVelocity = {
                x:(agentVelocity.x)*_fps, 
                y:(agentVelocity.y)*_fps,
                z:(agentVelocity.z)*_fps
            };

            // if(needsUpdate) { //provides a stronger direction change impulse
            //     acceleration.x += agentVelocity.x;
            //     acceleration.y += agentVelocity.y;
            //     acceleration.z += agentVelocity.z;
            // }

            agentUpdates[e.id] = {addVelocity};
        })

        return agentUpdates;
        //this.__node.graph.workers[portId]?.post('updatePhysicsEntity', [entity.id,agentUpdates[entity.id]]);
    }
};