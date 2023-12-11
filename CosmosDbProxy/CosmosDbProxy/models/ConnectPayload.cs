using Newtonsoft.Json;
using System.Text.Json.Serialization;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class ConnectPayload
    {
        [JsonProperty("connectionString")]
        public string? ConnectionString { get; set; }
    }
}