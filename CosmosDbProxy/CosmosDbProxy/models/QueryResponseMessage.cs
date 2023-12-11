using Newtonsoft.Json;
using System.Collections.ObjectModel;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class QueryResponseMessage
    {
        [JsonProperty("documents")]
        public Collection<dynamic>? Documents { get; set; }

        [JsonProperty("continuationToken")]
        public string? ContinuationToken { get; set; }

        [JsonProperty("maxCount")]
        public int MaxCount { get; set; }

        [JsonProperty("requestCharge")]
        public double RequestCharge { get; set; }

        [JsonProperty("count")]
        public int Count { get; set; }
    }
}