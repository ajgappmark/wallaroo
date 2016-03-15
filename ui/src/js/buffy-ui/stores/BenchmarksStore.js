import {ReduceStore} from "flux/utils";
import Actions from "../actions/Actions.js";
import Comparators from "../../util/Comparators.js";
import Dispatcher from "../../dispatcher/Dispatcher.js";
import { fromJS, List, Map } from "immutable";
import {minutes} from "../../util/Duration.js";
import AppConfig from "../config/AppConfig"

const emptyBenchmarks = Map()
                    .set("latencies", List())
                    .set("throughputs", List());

class BenchmarksStore extends ReduceStore {
    constructor(dispatcher) {
        super(dispatcher);
    }
    getInitialState() {
        let state = Map();

        Object.keys(AppConfig.SYSTEM_KEYS).forEach(systemKey => {
            const key = AppConfig.getSystemKey(systemKey);
            let pipelineKeys = AppConfig.getSystemPipelineKeys(systemKey);
            state = state.set(key, Map());

            Object.keys(pipelineKeys).forEach(pipelineKey => {
                let systemState = state.get(key);
                state = state.set(key, systemState.set(AppConfig.getChannelKey(key, pipelineKey), emptyBenchmarks));
            });
        });
        return state;

    }
    getPipelineLatencies(systemKey, pipelineKey) {
        return this.getState().get(systemKey).get(pipelineKey).get("latencies");
    }
    getPipelineThroughputs(systemKey, pipelineKey) {
        return this.getState().get(systemKey).get(pipelineKey).get("throughputs");
    }
    filterLatencyData(state, nextLatencyPercentiles, pipelineKey, systemKey) {
        const now = Date.now();
        const systemMap = state.get(systemKey);
        const benchmarksMap = systemMap.get(pipelineKey);
        const latenciesList = benchmarksMap.get("latencies");
        const nextLatency = {
            time: nextLatencyPercentiles.time,
            latency: nextLatencyPercentiles.latency_percentiles["50.0"],
            pipeline_key: nextLatencyPercentiles.pipeline_key
        };
        const updatedLatenciesList = latenciesList.push(fromJS(nextLatency)).sort(Comparators.propFor("time")).filter(d => {
            return now - d.get("time") < minutes(15)
        });
        return state.set(systemKey, systemMap.set(pipelineKey, benchmarksMap.set("latencies", updatedLatenciesList)));
    }
    filterThroughputData(state, nextThroughput, pipelineKey, systemKey) {
        const now = Date.now();
        const systemMap = state.get(systemKey);
        const benchmarksMap = systemMap.get(pipelineKey);
        const throughputsList = benchmarksMap.get("throughputs");
        const updatedThroughputsList = throughputsList.push(fromJS(nextThroughput)).sort(Comparators.propFor("time")).filter(d => {
            return now - d.get("time") < minutes(15)
        });
        return state.set(systemKey, systemMap.set(pipelineKey, benchmarksMap.set("throughputs", updatedThroughputsList)));
    }
    reduce(state, action) {
        if (!action) return state;
        let pipelineChannelKey;
        let systemKey;
        switch (action.actionType) {
            case Actions.RECEIVE_PRICE_SPREAD_LATENCY.actionType:
                pipelineChannelKey = action.latency.pipeline_key;
                systemKey = AppConfig.getSystemKey("MARKET_SPREAD_CHECK");
                return this.filterLatencyData(state, action.latency, pipelineChannelKey, systemKey);
            case Actions.RECEIVE_PRICE_SPREAD_THROUGHPUT.actionType:
                pipelineChannelKey = action.throughput.pipeline_key;
                systemKey = AppConfig.getSystemKey("MARKET_SPREAD_CHECK");
                return this.filterThroughputData(state, action.throughput, pipelineChannelKey, systemKey);
            default:
                return state;
        }
    }
}

const benchmarksStore = new BenchmarksStore(Dispatcher);
export default benchmarksStore;
