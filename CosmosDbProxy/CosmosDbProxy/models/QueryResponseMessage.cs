using Newtonsoft.Json;
using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class QueryResponseMessage : ResponseMessage
    {
        public QueryResponseMessage()
        {
            Command = "queryResult";
        }

        [JsonProperty("documents")]
        public Collection<dynamic> Documents { get; set; }

        [JsonProperty("continuationToken")]
        public string ContinuationToken { get; set; }

        [JsonProperty("maxCount")]
        public int MaxCount { get; set; }
    }
}