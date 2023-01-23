export type PhysicsEntityProps = {
    collisionType:'ball'|'cuboid'|'capsule'|'cone'|'cylinder'|'triangle'|'segment'|'trimesh'|
        'convexHull'|'convexMesh'|'heightfield'|'polyline'|
        'roundCone'|'roundTriangle'|'roundCylinder'|'roundCuboid'|'roundConvexHull'|'roundConvexMesh',
    collisionTypeParams?:any[], //e.g. radius, box dimensions
    dynamic?:boolean,
    position?:{x:number,y:number,z:number},
    rotation?:{x:number,y:number,z:number, w:number},
    radius?:number, //ball or capsule
    halfHeight?:number, //capsule
    dimensions?:{height:number, width:number, depth:number}, //cuboid
    mass?:number,
    centerOfMass?:{x:number,y:number,z:number},
    density?:number,
    restitution?:number,
    _id?:string
}