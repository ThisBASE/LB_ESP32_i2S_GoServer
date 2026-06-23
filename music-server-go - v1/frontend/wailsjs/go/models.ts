export namespace main {
	
	export class ClientInfo {
	    ip: string;
	    state: string;
	    file?: string;
	    startTime: string;
	    lastSeen: string;
	
	    static createFrom(source: any = {}) {
	        return new ClientInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ip = source["ip"];
	        this.state = source["state"];
	        this.file = source["file"];
	        this.startTime = source["startTime"];
	        this.lastSeen = source["lastSeen"];
	    }
	}

}

