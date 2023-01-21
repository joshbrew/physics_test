

import RAPIER from '@dimforge/rapier3d-compat'
import { GraphNode, WorkerService } from 'graphscript'
import { PhysicsEntity } from './types';

declare var WorkerGlobalScope;

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:{
            initWorld:function(gravity?:{x:number,y:number,z:number},...args:any[]) {
                return new Promise((res) => {
                    RAPIER.init().then(() =>{
                        if(!gravity) gravity = { x: 0.0, y: -9.81, z:0 }; //for babylonjs we'll use y = -9.81 for correct world orientation
                        (this.__node.graph as WorkerService).world = new RAPIER.World(gravity,...args);
                        res(true); //rapier is ready
                    });
                });
            },
            addPhysicsEntity:function (
                settings:PhysicsEntity
            ) {
                let rtype = settings.dynamic ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed; //also kinematic types, need to learn what those do
                
                let desc = new RAPIER.RigidBodyDesc(
                    rtype
                );

                if(settings.position) {
                    desc.setTranslation(
                        settings.position.x,
                        settings.position.y,
                        settings.position.z
                    );
                }
                if(settings.rotation) {
                    desc.setRotation(settings.rotation);
                }

                let rigidbody = (this.__node.graph.world as RAPIER.World).createRigidBody(
                    desc
                )

                //@ts-ignore //fuk u tuples
                let collider = RAPIER.ColliderDesc[settings.collisionType](...settings.collisionTypeParams) as ColliderDesc;

                if(settings.density) {
                    collider?.setDensity(settings.density);
                }
                if(settings.restitution) {
                    collider?.setRestitution(settings.restitution);
                }
                if(settings.mass) {
                    collider?.setMass(settings.mass);
                } 
                if(settings.centerOfMass) {
                    collider?.setMassProperties(
                        settings.mass as number,
                        settings.centerOfMass,
                        undefined as any,
                        undefined as any
                    );
                }

                ((this.__node.graph as WorkerService).world as RAPIER.World).createCollider(
                    collider,
                    rigidbody
                );

                if(!settings._id) settings._id = `${settings.collisionType}${Math.floor(Math.random()*1000000000000000)}`;

                Object.defineProperty(rigidbody, '_id', {value:settings._id, enumerable:true}); //for reference

                let node = (this.__node.graph as WorkerService).add({
                    __props:rigidbody,
                    __node:{tag:settings._id},
                    __ondisconnected:function(node:GraphNode) {
                        ((node.__node.graph as WorkerService).world as RAPIER.World).removeRigidBody(rigidbody);
                    }
                });

                return node.__node.tag; //can control the rigid body node by proxy by passing this tag in

            },
            removePhysicsEntity:function(_id:string) {
                return typeof (this.__node.graph as WorkerService).remove(_id) !== 'string';
            },
            stepWorld:function(
                getValues?:boolean,
                buffered?:boolean //use float32array (px,py,pz,rx,ry,rz,rw * nbodies)? Much faster to transfer
            ) {
                (this.__node.graph.world as RAPIER.World).step();
                if(getValues) {

                    let values = buffered ? new Float32Array((this.__node.graph.world as RAPIER.World).bodies.len() * 7) : {};
                    let idx = 0;
                    let bufferValues = (body:RAPIER.RigidBody) => {
                        if(buffered) {
                            let position = body.translation();
                            let rotation = body.rotation();

                            let offset = idx*7;

                            values[offset]   = position.x;
                            values[offset+1] = position.y;
                            values[offset+2] = position.z;
                            values[offset+3] = rotation.x;
                            values[offset+4] = rotation.y;
                            values[offset+5] = rotation.z;
                            values[offset+6] = rotation.w;
                        }
                        else values[(body as any)._id] = {
                            position:body.translation(),
                            rotation:body.rotation()
                        }
                        idx++;
                    }
                    (this.__node.graph.world as RAPIER.World).bodies.forEach(bufferValues)

                    return values;
                }
                
                return true;
            },
            animateWorld:function(getValues?:boolean,buffered?:boolean) {
                
                let stepWorldNode = this.__node.graph.get('stepWorld');
                let animate = () => {
                    if(this.__node.graph.worldIsAnimating) {
                        stepWorldNode.__operator(getValues,buffered);
                        requestAnimationFrame(animate);
                    }
                }
                
                if(!this.__node.graph.worldIsAnimating) this.__node.graph.worldIsAnimating = true;
                animate();
                return true;
            },
            stopAnimatingWorld:function() {
                this.__node.graph.worldIsAnimating = false;
            }
        }
    });


}

export default self as any;