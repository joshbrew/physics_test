//does not do rotations yet...

type Sphere = {
    collisionType:'sphere',
    position:{x:number,y:number,z:number},
    collisionEnabled?:boolean,
    collisionRadius:number,
    collisionBoundsScale:{x:number,y:number,z:number}, //like eigenvalues
};

type Box = {
    collisionType:'box',
    collisionEnabled?:boolean,
    position:{x:number,y:number,z:number},
    collisionRadius:number,
    collisionBoundsScale:{x:number,y:number,z:number}, //like eigenvalues
    [key:string]:any
};

type Triangle = {
    collisionType:'triangle',
    collisionEnabled?:boolean,
    position:{x:number,y:number,z:number},
    0:{x:number,y:number,z:number}, //in local space
    1:{x:number,y:number,z:number}, //
    2:{x:number,y:number,z:number}, //
    [key:string]:any
};

type Point = {
    collisionType:'point'
    collisionEnabled?:boolean,
    position:{x:number, y:number, z:number}
}

type Capsule = {
    position:{x:number,y:number,z:number},
    lineStart:{x:number,y:number,z:number}, //in local space
    lineEnd:{x:number,y:number,z:number}, //in local space
    collisionRadius:number
}

const collisionCheck = (
    body1:{
        position:{x:number,y:number,z:number},
        collisionEnabled?:boolean,
        collisionType:'sphere'|'box'|'point'|'triangle',
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    },
    body2:{
        position:{x:number,y:number,z:number},
        collisionEnabled?:boolean,
        collisionType:'sphere'|'box'|'point'|'triangle',
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    }
)=>{
    if(body1.collisionEnabled === false || body2.collisionEnabled === false) return false;

    const dist = distance(body1.position,body2.position);

    if( body1.collisionRadius && body2.collisionRadius && 
        //Check if within a range close enough to merit a collision check
        dist > (   
            Math.max(...Object.values(body1.collisionBoundsScale))*body1.collisionRadius + 
            Math.max(...Object.values(body2.collisionBoundsScale))*body2.collisionRadius
        )
    ) return false;
    
    //Do collision check
    let isColliding = false;
    if(body1.collisionType === "sphere") {
        if(body2.collisionType === "sphere") { isColliding = sphereCollisionCheck(body1,body2,dist);}
        else if(body2.collisionType === "box") { isColliding = sphereBoxCollisionCheck(body1,body2,dist);}
        else if(body2.collisionType === "point") { isColliding = isPointInsideSphere(body2.position,body1,dist);}
        else if(body2.collisionType === 'triangle') { isColliding = sphereTriangleCollision(body1,body2 as any);};
    }
    else if(body1.collisionType === "box" ) {
        if(body2.collisionType === "sphere") { isColliding = sphereBoxCollisionCheck(body2,body1,dist);}
        else if(body2.collisionType === "box") { isColliding = boxCollisionCheck(body1,body2);}
        else if(body2.collisionType === "point") { isColliding = isPointInsideBox(body1.position,body1); }
    }
    else if (body1.collisionType === "point") {
        if(body2.collisionType === "sphere") { isColliding = isPointInsideSphere(body1.position,body2,dist); }
        else if(body2.collisionType === "box") { isColliding = isPointInsideBox(body1.position,body2); }
    } else if (body1.collisionType === 'triangle') {
        if(body2.collisionType === 'sphere') { isColliding = sphereTriangleCollision(body2,body1 as any);} 
    }

    if(isColliding) return dist;
    return false;
}

const sphereCollisionCheck = ( //simplest collisions
    body1:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    },
    body2:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    },
    dist?:number
)=>{
    if(dist === undefined) dist = distance(body1.position,body2.position);

    return (dist as number) < (body1.collisionRadius + body2.collisionRadius);
}

const boxCollisionCheck = ( //also simple but corners are a problem, does not account for rotations
    body1:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    },
    body2:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    }
)=>{
    let body1minX = (body1.position.x-body1.collisionRadius)*body1.collisionBoundsScale.x;
    let body1maxX = (body1.position.x+body1.collisionRadius)*body1.collisionBoundsScale.x;
    let body1minY = (body1.position.y-body1.collisionRadius)*body1.collisionBoundsScale.y;
    let body1maxY = (body1.position.y+body1.collisionRadius)*body1.collisionBoundsScale.y;
    let body1minZ = (body1.position.z-body1.collisionRadius)*body1.collisionBoundsScale.z;
    let body1maxZ = (body1.position.z+body1.collisionRadius)*body1.collisionBoundsScale.z;

    let body2minX = (body2.position.x-body2.collisionRadius)*body1.collisionBoundsScale.x;
    let body2maxX = (body2.position.x+body2.collisionRadius)*body1.collisionBoundsScale.x;
    let body2minY = (body2.position.y-body2.collisionRadius)*body1.collisionBoundsScale.y;
    let body2maxY = (body2.position.y+body2.collisionRadius)*body1.collisionBoundsScale.y;
    let body2minZ = (body2.position.z-body2.collisionRadius)*body1.collisionBoundsScale.z;
    let body2maxZ = (body2.position.z+body2.collisionRadius)*body1.collisionBoundsScale.z;

    return  (
        ((body1maxX <= body2maxX && body1maxX >= body2minX) || (body1minX <= body2maxX && body1minX >= body2minX)) &&
        ((body1maxY <= body2maxY && body1maxY >= body2minY) || (body1minY <= body2maxY && body1minY >= body2minY)) &&
        ((body1maxZ <= body2maxZ && body1maxZ >= body2minZ) || (body1minZ <= body2maxZ && body1minZ >= body2minZ))
    );
}
const sphereBoxCollisionCheck = (
    sphere:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    },
    box:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    },
    dist?:number
)=>{
    let boxMinX = (box.position.x-box.collisionRadius)*box.collisionBoundsScale.x;
    let boxMaxX = (box.position.x+box.collisionRadius)*box.collisionBoundsScale.x;
    let boxMinY = (box.position.y-box.collisionRadius)*box.collisionBoundsScale.y;
    let boxMaxY = (box.position.y+box.collisionRadius)*box.collisionBoundsScale.y;
    let boxMinZ = (box.position.z-box.collisionRadius)*box.collisionBoundsScale.z;
    let boxMaxZ = (box.position.z+box.collisionRadius)*box.collisionBoundsScale.z;

    //let direction = Math.makeVec(sphere.position,box.position);

    //Get closest point to sphere center
    let clamp = {
        x:Math.max(boxMinX, Math.min(sphere.position.x, boxMaxX)),
        y:Math.max(boxMinY, Math.min(sphere.position.y, boxMaxY)),
        z:Math.max(boxMinZ, Math.min(sphere.position.z, boxMaxZ))
    };

    if(dist === undefined) dist = distance(sphere.position,clamp);

    return (dist as number) > sphere.collisionRadius;
}

const sphereTriangleCollision = (
    sphere:{
        position:{x:number,y:number,z:number},
        collisionBoundsScale:{x:number,y:number,z:number},
        collisionRadius:number,
        [key:string]:any
    },
    triangle:{ //3 vec3 points define a triangle in 3D space
        position:{x:number,y:number,z:number},
        0:{x:number,y:number,z:number}, //local space
        1:{x:number,y:number,z:number},
        2:{x:number,y:number,z:number}
    }
) => {

    //this is a VERY EXPENSIVE METHOD, but it is verbose. We'll care more on the GPU with traditional data structures
    
    //getting real space coordinates
    let tri0 = {x:triangle[0].x+triangle.position.x,y:triangle[0].y+triangle.position.y,z:triangle[0].z+triangle.position.z};
    let tri1 = {x:triangle[1].x+triangle.position.x,y:triangle[1].y+triangle.position.y,z:triangle[1].z+triangle.position.z};
    let tri2 = {x:triangle[2].x+triangle.position.x,y:triangle[2].y+triangle.position.y,z:triangle[2].z+triangle.position.z};

    let p1_0 = makeVec3(tri0,tri1);
    let p2_0 = makeVec3(tri0,tri2);
    let N = normalize(cross3D( // plane normal
        p1_0, p2_0
    ));
    let distance = dot(makeVec3(tri0,sphere.position), N); // signed distance between sphere and plane
    
    let intersection =  Math.abs(distance) < sphere.collisionRadius; // is sphere intersecting the infinite plane with the triangle?

    if(intersection) {
        let point = makeVec3({x:N.x*distance, y:N.y*distance, z:N.z*distance}, sphere.position);
        
        let c0 = cross3D(makeVec3(point,tri0), p1_0);
        let c1 = cross3D(makeVec3(point,tri1), makeVec3(tri2,tri1));
        let c2 = cross3D(makeVec3(point,tri2),p2_0);

        let inside = dot(c0,N) <= 0 && dot(c1,N) <= 0 && dot(c2,N) <= 0; //is point inside all edges?

        return inside;
    } else return false;
}//https://wickedengine.net/2020/04/26/capsule-collision-detection/ <- GPU math versions

//two capsules, basically combines sphere collisions and closestPointOnLine
const capsuleCollisionCheck = (
    capsule1:{
        position:{x:number,y:number,z:number},
        lineStart:{x:number,y:number,z:number}, //in local space
        lineEnd:{x:number,y:number,z:number}, //in local space
        collisionRadius:number
    },
    capsule2:{
        position:{x:number,y:number,z:number},
        lineStart:{x:number,y:number,z:number}, //in local space
        lineEnd:{x:number,y:number,z:number}, //in local space
        collisionRadius:number
    }
) => {

}

const isPointInsideSphere = (
    point:{x:number,y:number,z:number},
    sphere:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    },
    dist?:number
)=>{
    if(dist === undefined) dist = distance(point,sphere.position);

    return (dist as number) < sphere.collisionRadius;
}

const isPointInsideBox = (
    point:{x:number,y:number,z:number},
    box:{
        position:{x:number,y:number,z:number},
        collisionRadius:number,
        collisionBoundsScale:{x:number,y:number,z:number},
        [key:string]:any
    }
)=>{
    //should precompute these for speed with Box objects as reference
    let boxminX = (box.position.x-box.collisionRadius)*box.collisionBoundsScale.x;
    let boxmaxX = (box.position.x+box.collisionRadius)*box.collisionBoundsScale.x;
    let boxminY = (box.position.y-box.collisionRadius)*box.collisionBoundsScale.x;
    let boxmaxY = (box.position.y+box.collisionRadius)*box.collisionBoundsScale.x;
    let boxminZ = (box.position.z-box.collisionRadius)*box.collisionBoundsScale.x;
    let boxmaxZ = (box.position.z+box.collisionRadius)*box.collisionBoundsScale.x;

    return  (point.x >= boxminX && point.x <= boxmaxX) &&
            (point.y >= boxminY && point.y <= boxmaxY) &&
            (point.z >= boxminZ && point.z <= boxmaxZ);
}

const closestPointOnLine = (
    point:{x:number,y:number,z:number},
    lineStart:{x:number,y:number,z:number},
    lineEnd:{x:number,y:number,z:number},
)=>{
    let a = {x:lineEnd.x-lineStart.x,y:lineEnd.y-lineStart.y,z:lineEnd.z-lineStart.z};
    let b = {x:lineStart.x-point.x,y:lineStart.y-point.y,z:lineStart.z-point.z};
    let c = {x:lineEnd.x-point.x,y:lineEnd.y-point.y,z:lineEnd.z-point.z};
    let bdota = dot(b,a);
    if(bdota <= 0) return lineStart;
    let cdota = dot(c,a);
    if(cdota <= 0) return lineEnd;
    let _bdotapluscdota = 1/(bdota+cdota);
    return {
        x:lineStart.x + ((lineEnd.x-lineStart.x)*bdota)*_bdotapluscdota,
        y:lineStart.y + ((lineEnd.y-lineStart.y)*bdota)*_bdotapluscdota,
        z:lineStart.z + ((lineEnd.z-lineStart.z)*bdota)*_bdotapluscdota
    };
}

const closestPointOnPolygon = (
    point:{x:number,y:number,z:number},
    t0:{x:number,y:number,z:number},
    t1:{x:number,y:number,z:number},
    t2:{x:number,y:number,z:number}
)=>{
    //Find the normal of the polygon
    let n = calcNormal(t0,t1,t2);
    //Find the distance from point to the plane given the normal
    let dist = dot(point,n) - dot(t0,n);
    //project p onto the plane by stepping from p to the plane
    let projection = vecadd(point,vecscale(n,-dist));

    //compute edge vectors
    let v0x = t2[0] - t0[0];
    let v0y = t2[1] - t0[1];
    let v0z = t2[2] - t0[2];
    let v1x = t1[0] - t0[0];
    let v1y = t1[1] - t0[1];
    let v1z = t1[2] - t0[2];
    let v2x = projection[0] - t0[0];
    let v2y = projection[1] - t0[1];
    let v2z = projection[2] - t0[2];

    //compute dots
    let dot00 = v0x*v0x+v0y*v0y+v0z*v0z;
    let dot01 = v0x*v1x+v0y*v1y+v0z*v1z;
    let dot02 = v0x*v2x+v0y*v2y+v0z*v2z;
    let dot11 = v1x*v1x+v1y*v1y+v1z*v1z;
    let dot12 = v1x*v2x+v1y*v2y+v1z*v2z;

    //compute barycentric coords (uvs) of projection point
    let denom = dot00*dot11 - dot01*dot01;
    if(Math.abs(denom) < 1e-30) {
        return undefined; //unusable
    }
    let _denom = 1/denom;
    let u = (dot11*dot02 - dot01*dot12)*_denom;
    let v = (dot00*dot12 - dot01*dot02)*_denom;

    //check uv coordinates for validity
    if((u >= 0) && (v >= 0) && (u+v<1)) {
        return projection;
    } else return undefined; //nearest orthogonal point is outside triangle

}

const calcNormal = (
    t0:{x:number,y:number,z:number},
    t1:{x:number,y:number,z:number},
    t2:{x:number,y:number,z:number},
    positive=true
)=>{
    var QR = makeVec3(t0,t1);
    var QS = makeVec3(t0,t2);

    if(positive === true){
        return normalize(cross3D(QR,QS));
    }
    else {
        return normalize(cross3D(QS,QR));
    }
}

const dot = (
    v1:{[key:string]:number},
    v2:{[key:string]:number}
)=>{
    let dot = 0;
    for(const key in v1) {
        dot += v1[key]*v2[key];
    }
    return dot;
}

const makeVec3 = (
    p1:{x:number,y:number,z:number},
    p2:{x:number,y:number,z:number}
) => {
    return {
        x:p2.x-p1.x,
        y:p2.y-p1.y,
        z:p2.z-p1.z
    };
}

const makeVec = (
    p1:{[key:string]:number},
    p2:{[key:string]:number}
) => {
    let vec = {};
    for(const key in p1) {
        vec[key] = p2[key] - p1[key];
    }
    return vec;
}

const vecadd = (
    v1:{[key:string]:number},
    v2:{[key:string]:number}
)=>{ //v1+v2
    let result = Object.assign({},v1);
    for(const key in result) {
        result[key] += v2[key];
    }
    return result;
}

const vecsub = (
    v1:{[key:string]:number},
    v2:{[key:string]:number}
)=>{ //v1-v2, e.g. a point is v2 - v1
    let result = Object.assign({},v1);
    for(const key in result) {
        result[key] -= v2[key];
    }
    return result;
}

const vecmul = (
    v1:{[key:string]:number},
    v2:{[key:string]:number}
)=>{ //v1*v2
    let result = Object.assign({},v1);
    for(const key in result) {
        result[key] *= v2[key];
    }
    return result;
}

const vecdiv = (
    v1:{[key:string]:number},
    v2:{[key:string]:number}
)=>{ //v1/v2
    let result = Object.assign({},v1);
    for(const key in result) {
        result[key] /= v2[key];
    }
    return result;
}

const vecscale = (
    v1:{[key:string]:number},
    scalar:number
)=>{ //v1*v2
    let result = Object.assign({},v1);
    for(const key in result) {
        result[key] *= scalar;
    }
    return result;
}
const distance = (
    v1:{[key:string]:number},
    v2:{[key:string]:number}
)=>{
    let distance = 0;
    for(const key in v1) {
        distance += Math.pow(v1[key]-v2[key],2)
    }
    return Math.sqrt(distance);
}

const magnitude = (
    v:{[key:string]:number}
) => {
    let magnitude = 0;
    for(const key in v) {
        magnitude += v[key]*v[key];
    }
    return Math.sqrt(magnitude);
}

const normalize = (
    v:{[key:string]:number}
) => {
    let mag = magnitude(v);
    let _mag = mag ? 1/mag : 0;
    let vn = {};
    for(const key in v) {
        vn[key] = v[key]*_mag;
    }

    return vn as {[key:string]:number};

}

const distance3D = (
    v1:{x:number,y:number,z:number},
    v2:{x:number,y:number,z:number}
) => {
    return Math.sqrt((v1.x-v2.x)*(v1.x-v2.x) + (v1.y-v2.y)*(v1.y-v2.y) + (v1.z-v2.z)*(v1.z-v2.z))
}

const cross3D = (
    v1:{x:number,y:number,z:number},
    v2:{x:number,y:number,z:number}
) => { //3D vector cross product
    return {
        x:v1.y*v2.z-v1.z*v2.y,
        y:v1.z*v2.x-v1.x*v2.z,
        z:v1.x*v2.y-v1.y*v2.x
    };
}

const nearestNeighborSearch = (
    entities:{[key:string]:any}, 
    isWithinRadius:number=1000000000000000
) => {

    var tree = {};;

    for(const key in entities){
        let newnode =  {
            tag:key,
            position: undefined,
            neighbors: []
        };
        newnode.position = entities[key].position;
        tree[key] = newnode;
    }

    //Nearest neighbor search. This can be heavily optimized.


    for(const i in tree) { //for each node
        for(const j in tree) { //for each position left to check
            var distance = distance3D(tree[i].position,tree[j].position);
            if(distance < isWithinRadius){
                var newNeighbori = {
                    tag:j,
                    position: entities[j].position,
                    distance
                };
                tree[i].neighbors.push(newNeighbori);
                var newNeighborj = {
                    tag:j,
                    position: entities[i].position,
                    distance
                };
                tree[j].neighbors.push(newNeighborj);
            }
        }
        tree[i].neighbors.sort(function(a,b) {return a.distance - b.distance}); //Sort by distance, nearest to farthest according to array index
    }

    return tree;
}

//dynamic AABB trees or octrees
const generateBoundingVolumeTree = (
    entities:{[key:string]:any}, 
    mode:'octree'|'aabb'='octree', 
    withinRadius:number=1000000000000000,
    minEntities:number=3 //keep dividing until only this many entities are contained in the smallest bounding volume
) => {
    
    /*
    How to make dynamic bounding volume tree:
    1. Find the bounding volume of all of the objects combined.
    2. Now subdivide bounding volumes by whatever magnitude until you have groups of 2-5 objects closest to each other.
    3. Use box collision checks on the tree to find the best candidates to search for collisions
    */

    let dynamicBoundingVolumeTree = {
        proto:{
            parent:undefined,
            children:{} as any,
            entities:{} as {[key:string]:any},
            collisionType:"box",
            collisionRadius: 1, 
            collisionBoundsScale: {x:1,y:1,z:1}, //radius of bounding box
            position:{x:0,y:0,z:0} //center of bounds
        },
        tree:{} //head will be a hard copy of the prototype and so on
    };

    let maxX, maxY, maxZ;
    let minX = 0, minY = 0, minZ = 0;
    let positions = {};
    let minRadius = withinRadius;

    for(const key in entities) {
        const body = entities[key];

        let xx = body.position.x+body.collisionRadius*body.collisionBoundsScale.x;
        let yy = body.position.y+body.collisionRadius*body.collisionBoundsScale.y;
        let zz = body.position.z+body.collisionRadius*body.collisionBoundsScale.z;

        if(maxX < xx) maxX = xx;
        if(minX > xx) minX = xx;
        if(maxY < yy) maxY = yy;
        if(minY > yy) minY = yy;
        if(maxZ < zz) maxZ = zz;
        if(minZ > zz) minZ = zz;

        if(minRadius > body.collisionRadius) minRadius = body.collisionRadius;

        positions[key] = body.position;

    };

    let head = JSON.parse(JSON.stringify(dynamicBoundingVolumeTree.proto));

    let boxpos = {x:(maxX+minX)*0.5,y:(maxY+minY)*0.5,z:(maxZ+minZ)*0.5}
    let boxbounds = {x:maxX-boxpos.x,y:maxY-boxpos.y,z:maxZ-boxpos.z};
    
    head.position = boxpos;
    head.collisionBoundsScale = boxbounds; //radius to centers of each sides i.e. distance from center

    head.entities = entities;
    
    dynamicBoundingVolumeTree.tree = head;

    minRadius *= 2;

    if(mode === 'octree') { //octrees
        function genOct(parentPos,halfbounds) { //return center positions of child octree cubes, radius = parent half radius
            let oct1 = {x:parentPos.x+halfbounds.x,y:parentPos.y+halfbounds.y,z:parentPos.z+halfbounds.z}; //+x+y+z
            let oct2 = {x:parentPos.x-halfbounds.x,y:parentPos.y+halfbounds.y,z:parentPos.z+halfbounds.z}; //-x+y+z
            let oct3 = {x:parentPos.x+halfbounds.x,y:parentPos.y-halfbounds.y,z:parentPos.z+halfbounds.z}; //+x-y+z
            let oct4 = {x:parentPos.x+halfbounds.x,y:parentPos.y+halfbounds.y,z:parentPos.z-halfbounds.z}; //+x+y-z
            let oct5 = {x:parentPos.x-halfbounds.x,y:parentPos.y-halfbounds.y,z:parentPos.z+halfbounds.z}; //-x-y+z
            let oct6 = {x:parentPos.x-halfbounds.x,y:parentPos.y+halfbounds.y,z:parentPos.z-halfbounds.z}; //-x+y-z
            let oct7 = {x:parentPos.x+halfbounds.x,y:parentPos.y-halfbounds.y,z:parentPos.z-halfbounds.z}; //+x-y-z
            let oct8 = {x:parentPos.x-halfbounds.x,y:parentPos.y-halfbounds.y,z:parentPos.z-halfbounds.z}; //-x-y-z

            return [oct1,oct2,oct3,oct4,oct5,oct6,oct7,oct8];
        }

        function genOctTree(head) {           
            let halfbounds = {
                x:head.collisionBoundsScale.x*0.5,
                y:head.collisionBoundsScale.y*0.5,
                z:head.collisionBoundsScale.z*0.5
            };     
            let octPos = genOct(head.position,halfbounds);
            let check = Object.assign({},head.bodies);
            for(let i = 0; i < 8; i++) {
                let octquadrant = Object.assign(
                    JSON.parse(JSON.stringify(dynamicBoundingVolumeTree.proto)),
                    {position:octPos[i],collisionBoundsScale:halfbounds}
                );
                octquadrant.parent = head;
                //now check if any of the bodies are within these and eliminate from the check array
                for(const j in check) {
                    let collided = collisionCheck(check[j],octquadrant);
                    if(collided) {
                        octquadrant.entities[j] = check[j];
                        delete check[j];
                    }
                } //recursively check each oct for entities until only minEntities entities are contained, discount smaller volumes
                if(Object.keys(octquadrant.entities).length > minEntities-1) {
                    head.children[i] = octquadrant;
                    octquadrant.parent = head;
                    if(Object.keys(octquadrant.entities).length > minEntities && octquadrant.collisionRadius*0.5 > minRadius) {
                        genOctTree(octquadrant);
                    }
                }
            }
        }

        genOctTree(head);
        
        return head;
    }
    else { //dynamic AABB trees

        /**
         *  -------
         * |   o   |
         * |  o    |
         * |o   o  |
         * |   o   |
         * |      o|
         *  -------
         * 
         * Model: Bound all of the particles by nearest neighbors
         *        Now bound the bounding boxes by nearest 3 bounding boxes
         *        Continue until only 2 bounding boxes returned. Bound to head box containing all boxes.
         * 
        */
        let tree = nearestNeighborSearch(positions, withinRadius);

        let keys = Object.keys(tree);

        let tag = keys[Math.floor(Math.random()*keys.length)]; //beginning with random node
        let searching = true; 
        let count = 0;

        let genBoundingBoxLevel = (tree,volumes) => {
            let newVolumes = {};
            let foundidxs = {};
            let treekeys = Object.keys(tree);
            while(searching && (count < treekeys.length)) { 
                let node = tree[tag]; 
                let i = 0; 
                let j = 0;

                //starting position 
                let ux = positions[node.tag].x-volumes[node.tag].collisionBoundsScale.x, 
                    uy = positions[node.tag].y-volumes[node.tag].collisionBoundsScale.y, 
                    uz = positions[node.tag].z-volumes[node.tag].collisionBoundsScale.z, 
                    mx = positions[node.tag].x+volumes[node.tag].collisionBoundsScale.x, 
                    my = positions[node.tag].y+volumes[node.tag].collisionBoundsScale.y, 
                    mz = positions[node.tag].z+volumes[node.tag].collisionBoundsScale.z;

                let newvolume = JSON.parse(JSON.stringify(dynamicBoundingVolumeTree.proto));
                newvolume.tag = `bound${Math.floor(Math.random()*1000000000000000)}`;

                newvolume.children[node.tag] = volumes[node.tag];
                newvolume.bodies[node.tag] = entities[node.tag];
                volumes[node.tag].parent = newvolume;
                foundidxs[node.tag] = true; //remove added neighbors from candidate search for bounding boxes (till none left to search = move onto next layer of boxes)
                i++; j++;

                let nkeys = Object.keys(node.neighbors);

                while(i < nkeys.length && j < 3) { //make a box around the first 3 unchecked nearest neighbors 
                    if(foundidxs[node.neighbors[i].tag]) { i++; continue; }

                    let uxn = positions[node.neighbors[i].tag].x-volumes[node.neighbors[i].tag].collisionBoundsScale.x, 
                        uyn = positions[node.neighbors[i].tag].y-volumes[node.neighbors[i].tag].collisionBoundsScale.y, 
                        uzn = positions[node.neighbors[i].tag].z-volumes[node.neighbors[i].tag].collisionBoundsScale.z, 
                        mxn = positions[node.neighbors[i].tag].x+volumes[node.neighbors[i].tag].collisionBoundsScale.x, 
                        myn = positions[node.neighbors[i].tag].y+volumes[node.neighbors[i].tag].collisionBoundsScale.y, 
                        mzn = positions[node.neighbors[i].tag].z+volumes[node.neighbors[i].tag].collisionBoundsScale.z;

                    if(ux > uxn) ux = uxn;
                    if(mx < mxn) mx = mxn;
                    if(uy > uyn) uy = uyn;
                    if(my < myn) my = myn;
                    if(uz > uzn) uz = uzn;
                    if(mz < mzn) mz = mzn;

                    newvolume.children[node.neighbors[i].tag] = volumes[node.neighbors[i].tag];
                    newvolume.entities[node.neighbors[i].tag] = entities[node.neighbors[i].tag];
                    volumes[node.neighbors[i].tag].parent = newvolume;
                    foundidxs[node.neighbors[i].tag] = true; //remove added neighbors from candidate search for bounding boxes (till none left to search = move onto next layer of boxes)
                    i++; j++;
                }

                let pos = {x:(mx+ux)*0.5,y:(my+uy)*0.5,z:(mz+uz)*0.5};
                let bounds = {x:mx-pos.x,y:my-pos.y,z:mz-pos.z};

                newvolume.position = pos;
                newvolume.collisionBoundsScale = bounds;
                if(newvolume.bodies.length === 1) newvolume = node; //just forego the bounding volume if not bounding more than one node
                
                newVolumes[newvolume.tag] = newvolume;
                
                //now find the next not-found neighbor
                while(i < node.neighbors.length) {
                    if(!foundidxs[node.neighbors[i].tag]) break;
                    i++;
                }

                // then walk to the nearest unchecked node and make a box around the next 2 or 3 nearest neighbors
                // then continue till you run out of nodes to check. Should be left with a bounding tree with larger to smaller boxes
                // smallest nodes (the bodies) should be parented to their bounding boxes and so on afterward.

                if(i < node.neighbors.length) {
                    tag = node.neighbors[i].tag; //set the next node index to the unchecked node
                } else if(Object.keys(foundidxs).length < Object.keys(tree).length) { tag = keys[0]; } //else just jump back to zero and keep looking
                else searching = false; //no more to search
                
                count++;
            }

            return newVolumes;
        }

        //generate the largest bounding box level
        let result = genBoundingBoxLevel(tree,entities);

        // first result will be a list of volumes around each set of nearest 3 neighbors
        
        while(Object.keys(result).length > 2) { //and as long as we have enough volumes to bound, keep bounding each set of volumes into larger volumes
            let nextTree = nearestNeighborSearch(result,withinRadius);
            result = genBoundingBoxLevel(nextTree,result);
        }

        head.children = result; //that should parent the final bounding boxes to the main box

        head.children.forEach((n) => {n.parent = head;})

        return head;
    }
}