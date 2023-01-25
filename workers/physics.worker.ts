

import RAPIER from '@dimforge/rapier3d-compat'
import { GraphNode, WorkerService } from 'graphscript'
import { PhysicsEntityProps } from './types';

declare var WorkerGlobalScope;

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:{
            initWorld:function(entities?:PhysicsEntityProps[],gravity?:{x:number,y:number,z:number},...args:any[]) {
                return new Promise((res) => {
                    RAPIER.init().then(() =>{
                        if(!gravity) gravity = { x: 0.0, y: -9.81, z:0 }; //for babylonjs we'll use y = -9.81 for correct world orientation
                        (this.__node.graph as WorkerService).world = new RAPIER.World(gravity,...args);
                        if(entities) {
                            let tags = entities.map((props) => {
                                return this.__node.graph.run('addPhysicsEntity', props);
                            });
                            res(tags);
                        }
                        else res(true); //rapier is ready
                    });
                });
            },
            addPhysicsEntity:function (
                settings:PhysicsEntityProps
            ) {
                let rtype = settings.dynamic ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed; //also kinematic types, need to learn what those do
                
                let desc = new RAPIER.RigidBodyDesc(
                    rtype
                );

                let rigidbody = (this.__node.graph.world as RAPIER.World).createRigidBody(
                    desc
                )

                let collider: RAPIER.ColliderDesc | undefined;
                if(settings.collisionTypeParams) {
                    //@ts-ignore //fuk u tuples
                    collider = RAPIER.ColliderDesc[settings.collisionType](...settings.collisionTypeParams) as ColliderDesc;
                } else if (settings.collisionType === 'ball') {
                    collider = RAPIER.ColliderDesc.ball(settings.radius ? settings.radius : 1);
                } else if (settings.collisionType === 'capsule') {
                    collider = RAPIER.ColliderDesc.capsule(
                        settings.halfHeight ? settings.halfHeight : 1, 
                        settings.radius ? settings.radius : 1
                    );
                } else if (settings.collisionType === 'cuboid') {
                    if(settings.dimensions) collider = RAPIER.ColliderDesc.cuboid(settings.dimensions.width*.5, settings.dimensions.height*.5, settings.dimensions.depth*.5);
                    else collider = RAPIER.ColliderDesc.cuboid(0.5,0.5,0.5);
                }

                if(collider) {
                    if(settings.density) {
                        collider.setDensity(settings.density);
                    }
                    if(settings.restitution) {
                        collider.setRestitution(settings.restitution);
                    }
                    if(settings.mass) {
                        collider.setMass(settings.mass);
                    } 
                    if(settings.centerOfMass) {
                        collider.setMassProperties(
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

                    if(settings.friction) {
                        collider.setFriction(settings.friction);
                    } 
                }

                
                if(settings.position) {
                    rigidbody.setTranslation(settings.position,false);
                }
                if(settings.rotation) {
                    rigidbody.setRotation(settings.rotation,false);
                }

                if(settings.impulse) {
                    rigidbody.applyImpulse(settings.impulse,false);        
                }
                if(settings.force) {
                    rigidbody.addForce(settings.force,false);
                }
                if(settings.acceleration) {
                    let mass = rigidbody.mass();
                    rigidbody.applyImpulse(
                        {
                            x:settings.acceleration.x*mass,
                            y:settings.acceleration.y*mass,
                            z:settings.acceleration.z*mass
                        }, true
                    )
                }

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
            updatePhysicsEntity:function(_id:string,settings:Partial<PhysicsEntityProps>){
                let entity = this.__node.graph.get(_id) as RAPIER.RigidBody;
                if(entity as RAPIER.RigidBody) {
                    if(settings.position) {
                        entity.setTranslation(settings.position,true);
                    }
                    if(settings.rotation) {
                        entity.setRotation(settings.rotation,true);
                    }
    
                    if(settings.density) {
                        entity.collider(0).setDensity(settings.density);
                    }
                    if(settings.restitution) {
                        entity.collider(0).setRestitution(settings.restitution);
                    }
                    if(settings.mass) {
                        entity.collider(0).setMass(settings.mass);
                    } else entity.collider(0).setMass(1);
                    
                    if(settings.centerOfMass) {
                        entity.collider(0).setMassProperties(
                            settings.mass as number,
                            settings.centerOfMass,
                            undefined as any,
                            undefined as any
                        );
                    }
                    if(settings.impulse) {
                        entity.applyImpulse(settings.impulse,true);        
                    }
                    if(settings.force) {
                        entity.addForce(settings.force,true);
                    }
                    if(settings.acceleration) {
                        let mass = entity.mass();
                        entity.applyImpulse(
                            {
                                x:settings.acceleration.x*mass,
                                y:settings.acceleration.y*mass,
                                z:settings.acceleration.z*mass
                            }, true
                        )
                    }
                }
            },
            updatePhysicsEntities:function(updates:{[key:string]:Partial<PhysicsEntityProps>}|number[]) {
                if(Array.isArray(updates)) {
                    let i = 0;
                    let hasRotation = (updates.length / (this.__node.graph.world as RAPIER.World).bodies.len()) === 7;
                    let offset = hasRotation ? 7 : 3;
                    (this.__node.graph.world as RAPIER.World).bodies.forEach((body)=>{
                        let j = i * offset;
                        body.setTranslation(
                            {
                                x:updates[j],
                                y:updates[j+1],
                                z:updates[j+2],
                            },
                            true
                        );
                        if(hasRotation) body.setRotation(
                            {
                                x:updates[j+3],
                                y:updates[j+4],
                                z:updates[j+5],
                                w:updates[j+6]
                            },
                            true
                        );
                        i++;
                    })
                }
                else for(const key in updates) this.__node.graph.run('updatePhysicsEntity',key,updates[key]);
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
                        if(body.isDynamic()) {
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