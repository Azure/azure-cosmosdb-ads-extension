using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class RequestMessage
    {
        [JsonProperty("command")]
        public string Command { get; set; }

        [JsonProperty("requestId")]
        public string RequestId { get; set; }

        [JsonProperty("payload")]
        public JObject Payload { get; set; }
    }
}