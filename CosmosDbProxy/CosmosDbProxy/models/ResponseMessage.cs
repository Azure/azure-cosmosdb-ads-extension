using Newtonsoft.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public abstract class ResponseMessage
    {
        [JsonProperty("command")]
        public string Command { get; set; }

        [JsonProperty("requestId")]
        public string RequestId { get; set; }
    }
}