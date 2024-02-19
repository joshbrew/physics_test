


export const mazeRoutes = {

    //lets use the hunt and kill with braids octagonal configuration, we need square and octagonal cells
    createMaze:function() {

        //create a maze grid with a desired generator function,

        //assign maze information to meshes for correlating raycasts, otherwise we will use worldspace to correlate

        //create instances to represent maze grid, figure out a lighting solution

        /**
         * Lighting ideas:
         * 
         * 1. Shrink edges of some cells so allow an underneath light through
         * 
         * 2. Or use the mesh assignment tool for lights to generate a few dozen scattered around
         * 
         * 3. Keep a dim global light
         * 
         * 4. Player illuminates cone in front of them with a flashlight or something.
         * 
         * 5. Add some haze
         * 
         */

        //populate maze with doors and keys and ai

        //create corresponding flowfield(s)

        //have ai track on the player's location

        //ai activate on player sight, should maybe just raycast to the grid


        //send maze data to render thread to initialize it
    },


    getPlayerCell:function() {
        //get cell current player is in in the maze
    },

    createMazeCrowd:function(options) {
        //counts
        //patrols
        //max per grid cell
        //randomly assign patrols to and from goal to start point
    },

    //reset maze and flow fields
    resetMaze: function() {

    },

    updateFlowField:function(){
        //when user goes to a new cell, update the flow field

        //maybe have several flow fields, e.g. targeting keys, doors, end, and adjacent cells

        //swap flowfields around e.g. for patrolling or for chasing and outmaneuvering the player

    },

    //we should update all of the entities velocities based on flowfield position and report to physics thread to then report back to the render thread
    updateEntitiesFromFlowFields:function() {
        //update velocities according to the active flowfield(s) assigned to the entities

        //perhaps add some boiding behaviors
    }

};