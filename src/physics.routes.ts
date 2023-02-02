
import RAPIER from '@dimforge/rapier3d-compat'
import { GraphNode, WorkerService } from 'graphscript'
import { PhysicsEntityProps, Vec3 } from './types';

export const physicsRoutes = {

    initWorld:function(
        gravity?:{x:number,y:number,z:number},
        entities?:PhysicsEntityProps[],
        ...args:any[]
    ) {
        return new Promise((res) => {
            RAPIER.init().then(() =>{
                if(!gravity) gravity = { x: 0.0, y: -9.81, z:0 }; //for babylonjs we'll use y = -9.81 for correct world orientation
                (this.__node.graph as WorkerService).world = new RAPIER.World(gravity,...args);
                //(this.__node.graph as WorkerService).worldEvents = new RAPIER.EventQueue(true);
                if(entities) {
                    let tags = entities.map((props) => {
                        if(props.collisionType)
                            return this.__node.graph.run('addPhysicsEntity', props);
                        else return undefined;
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

        if(!settings.collisionType) return undefined;

        if(settings._id && this.__node.graph.get(settings._id)) return settings._id; //already established

        let rtype = settings.dynamic ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed; //also kinematic types, need to learn what those do
        
        let desc = new RAPIER.RigidBodyDesc(
            rtype
        );

        let rigidbody = (this.__node.graph.world as RAPIER.World).createRigidBody(
            desc
        )

        let collider: RAPIER.ColliderDesc | undefined;
        if(settings.collisionTypeParams) { //use this generically to set up collisions
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
            if(settings.dimensions) 
                collider = RAPIER.ColliderDesc.cuboid(
                    settings.dimensions.width ? settings.dimensions.width*.5 : 0.5, 
                    settings.dimensions.height ? settings.dimensions.height*.5 : 0.5, 
                    settings.dimensions.depth ? settings.dimensions.depth*.5 : 0.5);
            else 
                collider = RAPIER.ColliderDesc.cuboid(0.5,0.5,0.5);
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

        if(settings.ccd) rigidbody.enableCcd(settings.ccd);

        if(settings.linearDamping) {
            rigidbody.setLinearDamping(settings.linearDamping);
        }
        if(settings.angularDamping) {
            rigidbody.setAngularDamping(settings.angularDamping)
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
        if(settings.velocity) {
            rigidbody.setLinvel(
                settings.velocity,
                true
            );
        }
        if(settings.angvelocity) {
            rigidbody.setAngvel(
                settings.angvelocity,
                true
            );
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
        let rigidbody = this.__node.graph.get(_id) as RAPIER.RigidBody;
        if(rigidbody as RAPIER.RigidBody) {

            if(settings.linearDamping) {
                rigidbody.setLinearDamping(settings.linearDamping);
            }
            if(settings.angularDamping) {
                rigidbody.setAngularDamping(settings.angularDamping)
            }

            if(settings.position) {
                rigidbody.setTranslation(settings.position,true); //{x,y,z}
            }
            if(settings.rotation) {
                rigidbody.setRotation(settings.rotation,true); //quaternion {x,y,z,w}. Leave w as 1
            }
            if(settings.dynamic) {
                rigidbody.setBodyType(settings.dynamic ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed); //can set entity to be static or dynamic
            }
            if(settings.ccd) rigidbody.enableCcd(settings.ccd);

            if(settings.density) {
                rigidbody.collider(0).setDensity(settings.density);
            }
            if(settings.restitution) {
                rigidbody.collider(0).setRestitution(settings.restitution);
            }
            if(settings.mass) {
                rigidbody.collider(0).setMass(settings.mass);
            } 
            if(settings.friction) {
                rigidbody.collider(0).setFriction(settings.friction);
            }
            
            if(settings.centerOfMass) {
                rigidbody.collider(0).setMassProperties(
                    settings.mass as number,
                    settings.centerOfMass,
                    undefined as any,
                    undefined as any
                );
            }
            if(settings.impulse) {
                rigidbody.applyImpulse(settings.impulse,true);        
            }
            if(settings.force) {
                rigidbody.addForce(settings.force,true);
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
            if(settings.velocity) {

                let v = rigidbody.linvel();

                if(settings.velocity.x) v.x = settings.velocity.x;
                if(settings.velocity.y) v.y = settings.velocity.y;
                if(settings.velocity.z) v.z = settings.velocity.z;

                rigidbody.setLinvel(
                    v,
                    true
                );
            }
            if(settings.angvelocity) {

                let v = rigidbody.linvel();

                if(settings.angvelocity.x) v.x = settings.angvelocity.x;
                if(settings.angvelocity.y) v.y = settings.angvelocity.y;
                if(settings.angvelocity.z) v.z = settings.angvelocity.z;

                rigidbody.setAngvel(
                    v,
                    true
                );
            }

            return true;
        }
    },
    updatePhysicsEntities:function(updates:{[key:string]:Partial<PhysicsEntityProps>}|number[]) {

        const world = this.__node.graph.world as RAPIER.World;
        if(Array.isArray(updates)) {
            let i = 0;
            let hasRotation = (updates.length / world.bodies.len()) === 7;
            let offset = hasRotation ? 7 : 3;

            const update = (body)=>{
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
            }

            world.bodies.forEach(update); //assuming we're passing data for each body, static or dynamic
        }
        else for(const key in updates) this.__node.graph.run('updatePhysicsEntity',key,updates[key]);
    },
    stepWorld:function(
        getValues?:boolean,
        buffered?:boolean //use float32array (px,py,pz,rx,ry,rz,rw * nbodies)? Much faster to transfer
    ) {

        const world = this.__node.graph.world as RAPIER.World;
        //const events = (this.__node.graph as WorkerService).worldEvents as RAPIER.EventQueue;        

        world.step();

        if(getValues) {

            let data = {
                contacts:{}
            } as any;
            if(buffered) {
                data.buffer = new Float32Array();
            } else data.buffer = {};
            let idx = 0;
            let bufferValues = (body:RAPIER.RigidBody) => {
                if(body.isDynamic()) { //we don't need to buffer static body positions as they are assumed fixed and/or externally updated
                    if(buffered) {
                        let offset = idx*7;
                        let position = body.translation();
                        let rotation = body.rotation();

                        data.buffer[offset]   = position.x;
                        data.buffer[offset+1] = position.y;
                        data.buffer[offset+2] = position.z;
                        data.buffer[offset+3] = rotation.x;
                        data.buffer[offset+4] = rotation.y;
                        data.buffer[offset+5] = rotation.z;
                        data.buffer[offset+6] = rotation.w;

                        
                        //get contact events for each body and report
                        world.contactsWith(body.collider(0), (collider2) => {
                            if(!data.contacts[(body as any)._id]) data.contacts[(body as any)._id] = [];
                            data.contacts[(body as any)._id].push((collider2 as any).parent()._id);
                        });
                    }
                    else {
                        data.buffer[(body as any)._id] = {
                            position:body.translation(),
                            rotation:body.rotation()
                        }
                        //get contact events for each body and report
                        world.contactsWith(body.collider(0), (collider2) => {
                            if(!data.contacts[(body as any)._id]) data.contacts[(body as any)._id] = [];
                            data.contacts[(body as any)._id].push((collider2 as any).parent()._id);
                        });
                    }
                }
                idx++;
            }

            world.bodies.forEach(bufferValues);

            return data;
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
    },
    //use babylon for the raycasting, but sphere casting is good here
    sphereCast:function( //cast a sphere and collect collision information. More robust but less performant than raycasting
        radius:number=1, 
        startPos:Vec3, 
        direction:Vec3, //conforms more with babylonjs
        length:number,
        withCollision:(collision:RAPIER.ShapeColliderTOI) => void, //deal with the collision, does not return multiple collisions, use sphereIntersections for tha, e.g. chaining these commands using the witness vector
        filterCollider?:(colliderHandle:number) => boolean, //return true to continue the sphere cast with the previous closest collider filtered, the cast only returns the first acceptable hit
        stopAtPenetration:boolean = true,
        filterFlags?:RAPIER.QueryFilterFlags,
        filterGroups?:number,
        filterExcludeCollider?:number,
        filterExcludeRigidBody?:number
    ) {
        const world = this.__node.graph.world as RAPIER.World;

        if(!world) return;

        if(!this.__node.graph.worldQuery) this.__node.graph.worldQuery = new RAPIER.QueryPipeline();
        const query = this.__node.graph.worldQuery;

        const sphere = new RAPIER.Ball(radius);

        query.update(world.islands, world.bodies, world.colliders);

        let toi = 0.01;
        let _toi = 1/toi;

        let velocity = { 
            x:length*direction.x*_toi, 
            y:length*direction.y*_toi, 
            z:length*direction.z*_toi
        };

        //returns first collision
        let colliding = query.castShape(
            world.bodies,
            world.colliders,
            startPos,
            new RAPIER.Quaternion(0,0,0,1),
            velocity,
            sphere,
            toi,
            stopAtPenetration,
            filterFlags,
            filterGroups,
            filterExcludeCollider,
            filterExcludeRigidBody,
            filterCollider
        );

        if(colliding) withCollision(colliding);
        
        query.free();

        return colliding?.collider.handle; //return handle of collider for lookup etc.

    },
    sphereIntersections:function( //find all colliders intersecting a sphere of a given radius and position
        radius:number, 
        position:Vec3, 
        intersects:(collider?:RAPIER.RigidBody|null) => boolean, //return true or false to stop iterating
        filterCollider?:(colliderHandle:number) => boolean, //return true to call the intersection function
        filterFlags?:RAPIER.QueryFilterFlags,
        filterGroups?:number,
        filterExcludeCollider?:number,
        filterExcludeRigidBody?:number,
    ) {
        const world = this.__node.graph.world as RAPIER.World;

        if(!world) return;

        if(!this.__node.graph.worldQuery) this.__node.graph.worldQuery = new RAPIER.QueryPipeline();
        const query = this.__node.graph.worldQuery;

        const sphere = new RAPIER.Ball(radius);

        query.update(world.islands, world.bodies, world.colliders);

        let anyIntersection = false;

        query.intersectionsWithShape(
            world.bodies,
            world.colliders,
            position,
            new RAPIER.Quaternion(0,0,0,1),
            sphere,
            (handle) => {
                if(!anyIntersection) anyIntersection = true;
                return intersects(world.colliders.get(handle)?.parent());
            },
            filterFlags,
            filterGroups,
            filterExcludeCollider,
            filterExcludeRigidBody,
            filterCollider
        );
        
        query.free();

        return anyIntersection;

    }
}