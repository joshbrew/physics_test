

import { WorkerService } from 'graphscript'
import { physicsRoutes } from '../src/physics.routes';

declare var WorkerGlobalScope;

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:physicsRoutes
    });


}

export default self as any;