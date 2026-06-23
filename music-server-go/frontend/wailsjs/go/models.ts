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
	export class fileInfo {
	    name: string;
	    size: number;
	    sizeKB: number;
	
	    static createFrom(source: any = {}) {
	        return new fileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.sizeKB = source["sizeKB"];
	    }
	}

}

