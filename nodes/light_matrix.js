module.exports = function(RED) {
    function setter(config) {
        RED.nodes.createNode(this,config);
        var context = this.context();
        var node = this;
        var extend = require("xtend");
        node.defMsg = {};
        node.timer = false;
        for(var k in config)
            if(["priority","operation","overwrite","payload"].indexOf(k)!=-1 && (typeof config[k].length=="undefined" || config[k].length>0))
                node.defMsg[k] = config[k];

        this.on('input', function(msg) {
            if(node.timer)
                clearTimeout(node.timer);

            //this.warn(node.defMsg);
            node.send(extend(node.defMsg, msg));

            var timeout = parseFloat(config.timeout);
            if(timeout>0)
            {
                var units = config.units || "ms";
                if (!isNaN(timeout)) {
                    if (units == "s") { timeout = timeout * 1000; }
                    if (units == "min") { timeout = timeout * 1000 * 60; }
                    if (units == "hr") { timeout = timeout * 1000 *60 * 60; }

                    node.timer = setTimeout(function() {
                        node.timer = false;
                        node.send(extend(node.defMsg, {payload: "OFF"}));
                    }, timeout); // trigger every 60 secs
                }
            }
        });
    }
    RED.nodes.registerType("Setter",setter);

    function device(config) {
        RED.nodes.createNode(this,config);
        var context = this.context();
        var node = this;
        var extend = require("xtend");

        this.queue = {};
        this.oldValue = -1;
        this.prios = [];

        this.integrate = function(msg)
        {
            //this.warn(this.queue);
            //this.warn(msg);

            msg.priority = parseFloat(msg.priority);

            if(msg.payload>100.0 || msg.payload=="ON")
            {
                //this.queue = this.queue.filter(function(m) {return m.payload>0.0 || m.priority>msg.priority;});
                msg.payload = 1000.0;

                if(this.queue.length>0)
                    return;
            }
            if( (msg.payload<=0.0 && msg.operation!="min") || msg.payload=="OFF")
            {
                msg.payload = 0.0;
                msg.operation = "set";
                //this.oldValue = -1;
            }

            if(msg.overwrite)
            {
                //this.queue = this.queue.filter(function(m) {return m.priority>msg.priority;});
                for(var k=0; k<this.prios.length; k++) {
                    if(this.prios[k]>=msg.priority) break;
                    delete this.queue[this.prios[k]];
                }
            }

            this.queue[msg.priority] = msg;

            this.prios = [];
            for(var k in this.queue) this.prios.push(k);
            this.prios.sort();

            while(this.prios.length>0 && this.queue[this.prios[this.prios.length-1]].payload<=0.0) {
                delete this.queue[this.prios[this.prios.length-1]];
                this.prios.pop();
            }
        };

        this.compute = function()
        {
            //this.warn(this.queue);
            //this.warn(this.oldValue);

            if(this.oldValue=="ON") this.oldValue = 100.0;
            else if(this.oldValue=="OFF") this.oldValue = 0.0;

            var value=[0.0, this.oldValue, 100.0]; //min, val, max

            for(p in this.prios)
            {
                var i = this.prios[p];
                var m = this.queue[i];

                if(m.operation=="min") {
                    value[0] = m.payload;
                    if(value[0]>value[1])
                        value[1] = value[0];
                    if(value[0]>value[2])
                        value[2] = value[0];
                }
                else if(m.operation=="max") {
                    value[2] = m.payload;
                    if(value[2]<value[1])
                        value[1] = value[2];
                    if(value[2]<value[0])
                        value[0] = value[2];
                }
                else {
                    value[1] = m.payload;
                    if(value[1]<value[0])
                        value[0] = value[1];
                    if(value[1]>value[2])
                        value[2] = value[1];
                }
            }
            
            //this.warn(value);

            return Math.min(Math.max(value[0],value[1]),value[2]);
        };

        this.on('input', function(msg) {

            var defMsg = {
                priority: 0,
                payload: 0.0,
                operation: "set",
                overwrite: false
            };

            this.integrate( extend(defMsg, msg) );

            var value = this.compute();

            if(value<=0.0) value="OFF";
            else if(value>100.0 || (value>0 && config.switch)) value="ON";

            if(this.oldValue != value)
            {
                node.send({payload: value});
                this.oldValue = value;
            }
        
        });
    }
    RED.nodes.registerType("Device",device);
};
