export type Vec3 = {x:number,y:number,z:number}
export type Quat = {x:number,y:number,z:number,w:number}

export type PhysicsEntityProps = {
    _id:string, //needs to be unique to sync the threads
    collisionType:'ball'|'cuboid'|'capsule'|'cone'|'cylinder'|'triangle'|'segment'|'trimesh'| 
        'convexHull'|'convexMesh'|'heightfield'|'polyline'|
        'roundCone'|'roundTriangle'|'roundCylinder'|'roundCuboid'|'roundConvexHull'|'roundConvexMesh',
    collisionTypeParams?:any[], //e.g. radius, box dimensions
    dynamic?:boolean|'kinematicP'|'kinematicV', //kinematic P and V let you manually update positions or velocities respectively to be treated correctly in the physics world to indicate forces
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
    velocity?:Partial<Vec3>, //directional speed
    angvelocity?:Partial<Vec3>, //angular velocity
    addVelocity?:Partial<Vec3>,
    addAngVelocity?:Partial<Vec3>,
    acceleration?:Vec3, //will be calculated as a force based on mass
    linearDamping?:number, //linear damping (drag)
    angularDamping?:number //angular damping (rotation)

    parent?:string, //we can parent one mesh to another via fixed joints

    sensor?:boolean, //generate overlaps but not physics collisions
    ccd?:boolean //continuous collision detection ? for fast moving bodies

    collisionGroups?:number[], //which groups the entity will create contact events with in the physics engine, possible groups are 0-15
    collisionFilters?:number[], //specify which groups of the set that you only want this entity to trigger contact events with
    solverGroups?:number[], //if unspecified, use the collision groups, else this lets you specify if contact FORCES are to be applied for groups
    solverFilters?:number[], //only interact with these groups? Basically these let different objects have different interactions with varying overlap

}