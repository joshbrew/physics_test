import { WorkerService, workerCanvasRoutes, remoteGraphRoutes, CanvasProps, WorkerCanvas } from '../../graphscript/index'//'graphscript'
import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps } from './types';

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
        
                        const light = new BABYLON.HemisphericLight(
                            'light1', 
                            new BABYLON.Vector3(0,1,0), 
                            scene
                        )
        
                        let entityNames;
                        if(self.entities) {
                            entityNames = self.entities.map((e) => {
                                let entity = self.graph.run('loadBabylonEntity',scene,e); 
                                return e._id; 
                            })
                        }
        
                        self.engine = engine;
                        self.scene = scene;
                        self.camera = camera;
        
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
                        
                        for(const key in data) {
                            let mesh = (self.scene as BABYLON.Scene).getMeshByName(key);
                            if(mesh) {
                                mesh.position.x = data[key].position.x;
                                mesh.position.y = data[key].position.y;
                                mesh.position.z = data[key].position.z;
                                mesh.rotation.x = data[key].rotation.x;
                                mesh.rotation.y = data[key].rotation.y;
                                mesh.rotation.z = data[key].rotation.z;
                            }
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
            loadBabylonEntity:(scene:BABYLON.Scene, settings:PhysicsEntityProps) => {
                let entity;
                //limited settings rn for simplicity to work with the physics engine
                if(settings.collisionType === 'ball') {
                    if(!settings._id) settings._id = `ball${Math.floor(Math.random()*1000000000000000)}`
                    entity = BABYLON.MeshBuilder.CreateSphere(
                        settings._id,
                        { diameter:settings.radius ? settings.radius*2 : settings.collisionTypeParams ? settings.collisionTypeParams[0]*2 : 1, segments: 8 }, 
                        scene
                    )
                } else if (settings.collisionType === 'capsule') {
                    settings._id = `capsule${Math.floor(Math.random()*1000000000000000)}`;
                    entity = BABYLON.MeshBuilder.CreateCapsule(
                        settings._id,
                        { 
                            radius:settings.radius ? settings.radius*2 : settings.collisionTypeParams ? settings.collisionTypeParams[0]*2 : 1, 
                            height:settings.halfHeight ? settings.halfHeight*2 : settings.collisionTypeParams ? settings.collisionTypeParams[1]*2 : 1
                        },
                        scene
                    );
                } else if (settings.collisionType === 'cuboid') {
                    settings._id = `box${Math.floor(Math.random()*1000000000000000)}`,
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
                if(settings.position) {
                    entity.position.x = settings.position.x;
                    entity.position.y = settings.position.y;
                    entity.position.z = settings.position.z;
                }
                if(settings.rotation) {
                    entity.rotation.x = settings.rotation.x;
                    entity.rotation.y = settings.rotation.y;
                    entity.rotation.z = settings.rotation.z;
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