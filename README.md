# physics_test
 Rapier3D + BablyonJS test

To run:
`tinybuild`

or `npm i -g tinybuild & tinybuild` if you don't have it installed.

Rapier3D: fancy Rust -> JS WASM physics engine, it's faster than anything else free.

Benchmarks: https://www.dimforge.com/blog/2020/08/25/announcing-the-rapier-physics-engine/

BabylonJS: fancy JS rendering engine, including lots of extras. Little fatter than ThreeJS but heavier on game engine features.

The app with BabylonJS is about 6.1MB in size in our current bundler settings, not sure why it's so huge.

With ThreeJS the app is about 2MB, so the physics engine itself is <1MB bundled, since Three comes out to about 1MB by itself. Pretty freakin small though.