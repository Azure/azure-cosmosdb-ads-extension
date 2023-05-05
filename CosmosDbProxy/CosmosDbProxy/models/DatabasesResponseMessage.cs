using Newtonsoft.Json;
using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class DatabaseResponseMessage : ResponseMessage
    {
        public DatabaseResponseMessage()
        {
            Command = "databases";
        }

        [JsonProperty("databases")]
        public Collection<DatabaseInfo> Databases { get; set; }
    }

    public sealed class DatabaseInfo
    {
        [JsonProperty("id")]
        public string Id { get; set; }
    }
}