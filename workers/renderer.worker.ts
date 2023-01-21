import { WorkerService, workerCanvasRoutes, remoteGraphRoutes, CanvasProps } from '../../graphscript/index'//'graphscript'
import * as BABYLON from 'babylonjs'

declare var WorkerGlobalScope

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:{
            ...workerCanvasRoutes,
            ...remoteGraphRoutes,
            receiveBabylonCanvas:function(options:CanvasProps) {

                const BabylonProps = {
                    BABYLON
                };

                Object.assign(options,BabylonProps);

                let renderId = this.__node.graph.run('setupCanvas', options); //the the base canvas tools do the rest, all ThreeJS tools are on self, for self contained ThreeJS renders
                //you can use the canvas render loop by default, or don't provide a draw function and just use the init and the Three animate() callback

                //let canvasopts = this.graph.CANVASES[renderId] as WorkerCanvas;

                return renderId;
            }
        }
    });


}


export default self as any;