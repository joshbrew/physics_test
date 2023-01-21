export type PhysicsEntity = {
    collisionType:'ball'|'cuboid'|'capsule'|'cone'|'cylinder'|'triangle'|'segment'|'trimesh'|
        'convexHull'|'convexMesh'|'heightfield'|'polyline'|
        'roundCone'|'roundTriangle'|'roundCylinder'|'roundCuboid'|'roundConvexHull'|'roundConvexMesh',
    collisionTypeParams:any[], //e.g. radius, box dimensions
    dynamic?:boolean,
    position?:{x:number,y:number,z:number},
    rotation?:{x:number,y:number,z:number, w:number},
    mass?:number,
    centerOfMass?:{x:number,y:number,z:number},
    density?:number,
    restitution?:number,
     _id?:string
}