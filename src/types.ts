export type Vec3 = {x:number,y:number,z:number}
export type Quat = {x:number,y:number,z:number,w:number}

export type PhysicsEntityProps = {
    _id:string, //needs to be unique to sync the threads
    collisionType:'ball'|'cuboid'|'capsule'|'cone'|'cylinder'|'triangle'|'segment'|'trimesh'| 
        'convexHull'|'convexMesh'|'heightfield'|'polyline'|
        'roundCone'|'roundTriangle'|'roundCylinder'|'roundCuboid'|'roundConvexHull'|'roundConvexMesh',
    collisionTypeParams?:any[], //e.g. radius, box dimensions
    dynamic?:boolean,
    position?:Vec3,
    rotation?:Quat,
    radius?:number, //ball or capsule
    halfHeight?:number, //capsule
    dimensions?:{height?:number, width?:number, depth?:number}, //cuboid
    mass?:number,
    centerOfMass?:Vec3,
    density?:number,
    friction?:number,
    restitution?:number,

    crowd?:string, //join a crowd for navigation? Need to tell the thread what meshes to merge to create nav meshes. Crowd will update to physics thread with accelerations
    targetOf?:string //is this a target of a crowd?
    navMesh?:boolean //navMesh group to lump the entity into?

    impulse?:Vec3, //initial impulse
    force?:Vec3, //initial impulse
    velocity?:Vec3, //directional speed
    angvelocity?:Vec3, //angular velocity
    acceleration?:Vec3, //will be calculated as a force based on mass
    linearDamping?:number, //linear damping (drag)
    angularDamping?:number //angular damping (rotation)

    ccd?:boolean //continuous collision detection ? for fast moving bodies
}