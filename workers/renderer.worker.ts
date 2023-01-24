import { WorkerService, workerCanvasRoutes, remoteGraphRoutes, CanvasProps, WorkerCanvas } from '../../graphscript/index'//'graphscript'
import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps } from './types';

import Recast from  "recast-detour"
import { isTypedArray } from 'graphscript';

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
                        const camera = new BABYLON.FreeCamera(
                            'cam1', 
                            new BABYLON.Vector3(-30,5,0), 
                            scene
                        );
                       
        
                        camera.attachControl(canvas,false);
                        camera.setTarget(new BABYLON.Vector3(0,0,0));
                        console.log(camera);
        
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
                        self.camera = camera;
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
                                        walkableSlopeAngle: 75,
                                        walkableHeight: 100.0,
                                        walkableClimb: 1,
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
                                        if(entityNames[i] === 'ground') return true;
                                    });

                                    let merged = BABYLON.Mesh.MergeMeshes(filtered, false);

                                    if(merged) merged.visibility = 0;

                                    console.log('merged???', merged);
                                    let worker = new Worker(`${location.origin}/dist/navmeshwkr.js`);
                                    // worker.addEventListener('onmessage', (msg) => {
                                    //     console.log('message', msg);
                                    // });
                                    //@ts-ignore
                                    //nav._worker.postMessage('test'); //test

                                    //nav.setWorkerURL(`${location.origin}/dist/navmesh.worker.js`);
                                    //@ts-ignore
                                    nav._worker = worker;

                                    nav.createNavMesh(
                                        [merged as any], 
                                        navMeshParameters, 
                                        (navMeshData) => {
                                            console.log("got worker data", navMeshData);
                                            if(isTypedArray(navMeshData)) nav.buildFromNavmeshData(navMeshData);
                                        }
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
            removeEntity:function (scene:BABYLON.Scene, entity:string) {
                let mesh = scene.getMeshByName(entity)
                if(mesh) scene.removeMesh(mesh);
                return mesh !== undefined;
            }
        }
    });


}


export default self as any;